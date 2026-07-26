# Email Notifications & Background Jobs

How Home OS decides *whether* to notify a member, *how* it actually sends
that notification (in-app row, transactional email, or both), and *what*
makes any of this happen on a schedule when nobody has the app open. This
doc owns three things: the `NotificationPreference`/`Notification` decision
pipeline, the Resend/react-email integration, and the Vercel Cron → Route
Handler mechanism every scheduled sweep in the product (`plan.md` §6) relies
on. It does not own the `Reminder`/`ReminderOccurrence` firing *lifecycle*
itself (occurrence generation, snooze/dismiss state machine) — that belongs
to the `reminders` module's own docs once written; this file only covers the
point where a firing occurrence hands off into the notification/email
pipeline.

Companion docs, not duplicated here:
- [`docs/orm-conventions.md`](./orm-conventions.md) — the `Notification` /
  `NotificationPreference` / `DigestSubscription` / `Reminder` /
  `ReminderOccurrence` Prisma models themselves (field list, naming, the
  partial-unique-index gotcha for "only one live occurrence per reminder").
- [`docs/access-control.md`](./access-control.md) — role/visibility
  enforcement. Not very relevant here: none of the three entities this doc
  is about (`Notification`, `NotificationPreference`, `DigestSubscription`)
  carry a `visibility` column or go through `ObjectShare` — they're
  inherently per-member, not shareable objects, so `CLAUDE.md` rule 2 (the
  `visibility`/`ObjectShare` contract) simply doesn't apply to them. They
  still carry `householdId` and are always scoped by it (`CLAUDE.md` rule 1).
- [`docs/auth.md`](./auth.md) — `requireMember()`, the function every
  Server Action in this doc calls first to resolve the acting member.
- [`docs/project-structure.md`](./project-structure.md) §4.2–4.4 — the
  `src/lib/events/`, `src/lib/notifications/`, `src/lib/email/` folders this
  doc's code samples live in, and the event-bus runtime (`emitEvent`,
  `dispatchToSubscribers`) this doc builds on top of.
- `docs/module-architecture.md` (not yet written — a harness gap per
  `CLAUDE.md`) — the full `ModuleEventType`/`EventSubscription` contract.
  This doc only uses as much of it as the notification pipeline needs.

---

## 1. Where the code lives

```
src/lib/
├── events/
│   ├── emit.ts                      # emitEvent() — every module's Server Action/job calls this
│   └── dispatch.ts                  # dispatchToSubscribers() — fans out to EventSubscription rows
│                                     #   AND unconditionally runs the notification decision (§6)
├── notifications/
│   ├── entities/
│   │   ├── notification.ts          # Notification row shape + categoryKey registry types
│   │   ├── notification-preference.ts  # shouldEmail()/shouldCreateNotification() gates (§4)
│   │   └── digest-subscription.ts   # nextDigestRunAt() scheduling math (§8)
│   ├── actions/
│   │   ├── update-preferences.ts    # updateNotificationPreference(), updateDigestSubscription()
│   │   ├── mark-read.ts             # markNotificationRead()
│   │   └── mark-all-read.ts         # markAllNotificationsRead()
│   ├── queries/get-inbox.ts         # unread/read Notification rows for the bell feed
│   └── jobs/send-digests.tsx        # backs /api/cron/digests-send (§8)
# The bell UI itself lives under the app shell, not this lib folder — it's
# a rendered component, not notification business logic:
# src/components/app-shell/notification-bell.tsx (Server Component, fetches
# getInbox()) + notification-bell-button.tsx (the Popover Client Component).
# No src/lib/notifications/index.ts barrel exists — this whole tree is
# imported by direct file path everywhere (@/lib/notifications/queries/get-inbox
# etc.), same convention as the rest of src/lib/.
├── email/
│   ├── resend-client.ts             # Resend SDK wrapper, dev-redirect handling (§7)
│   └── templates/
│       ├── reminder-firing.tsx      # generic Reminder-fired template (manual/task/renewal/budget/document)
│       ├── bill-due-soon.tsx        # Reminder-fired template, used when sourceType = "subscription"
│       ├── task-assigned.tsx        # task.assigned
│       ├── share-received.tsx       # share.received
│       └── household-invite-received.tsx  # household.invite_received
└── dates.ts                         # startOfHouseholdDay()/endOfHouseholdDay(), plus
                                      # nextDigestRunAt() lives here too (§8) — all "when is 'now' in
                                      # this household's timezone" math is centralized in this one file

src/modules/
├── reminders/jobs/sweep-due-occurrences.ts        # backs /api/cron/reminders-sweep     (§9.1)
├── finance/jobs/sweep-subscription-due-dates.ts   # backs /api/cron/subscriptions-sweep (§9.2)
├── finance/jobs/sweep-budget-thresholds.ts        # backs /api/cron/budgets-sweep       (§9.3)
└── life-admin/jobs/sweep-renewal-lifecycle.ts     # backs /api/cron/renewals-sweep      (§9.4)

src/app/api/cron/
├── reminders-sweep/route.ts
├── subscriptions-sweep/route.ts
├── budgets-sweep/route.ts
├── renewals-sweep/route.ts
└── digests-send/route.ts

.github/workflows/cron.yml           # calls the five routes above on a schedule (§9.6)
```

None of the five `jobs/*.ts` files import from `src/app/` — Route Handlers
are thin wrappers that verify `CRON_SECRET` and call straight into a job
function, per `docs/project-structure.md` §6.

---

## 2. The notification-category registry: `categoryKey`

`NotificationPreference.categoryKey` and `ModuleEventType.key` share one
dot-namespaced vocabulary (`plan.md` §6: *"one namespace, not two"*). Every
category a member can see in **Settings → Notifications** corresponds to
exactly one `categoryKey`, and every `categoryKey` resolves to one of two
delivery mechanisms — this is the single most important distinction in this
doc, because it determines whether a `Notification` row gets written at all:

| Mechanism | In-app surface | Who writes it |
|---|---|---|
| **Notification-backed** | the bell/inbox feed | `dispatchToSubscribers()` writes one `Notification` row per eligible member (§6.2) |
| **Reminder-backed** | the target member's "active reminders" on the Today dashboard, via `ReminderOccurrence.status` | never a `Notification` row — the occurrence itself *is* the in-app surface (`plan.md` §3.1) |

### 2.1 Notification-backed categories (no `Reminder` in the path)

These are the categories `plan.md` §3.1 names explicitly as Notification's
reason to exist — nothing else in the system already surfaces them in-app:

| `categoryKey` | Owning module | Raised by | Email template |
|---|---|---|---|
| `task.assigned` | `tasks` | `emitEvent()` when `Task.assigneeId` is set/changed | `task-assigned.tsx` |
| `share.received` | `household` (platform substrate — `src/lib/household/module.ts`, not under `src/modules/`) | `ObjectShare` row created for a member | `share-received.tsx` |
| `household.invite_received` | `household` (platform substrate) | `Invite` row created | `household-invite-received.tsx` |

`share.received` and `household.invite_received` are real, already-named
event keys (`ROADMAP.md` §1), seeded as `ModuleEventType` rows owned by the
`household` pseudo-module — `docs/seeding.md` §5.1's resolution of the fact
that `household` isn't one of the 8 `src/modules/` `Module` rows but
`ModuleEventType.owningModuleId` is `NOT NULL`. `emitEvent()` can resolve
both keys today.

### 2.2 Reminder-backed categories (delivered through `Reminder`/`ReminderOccurrence`)

Any module that wants to alert one member at a point in time creates a
`Reminder` through the shared capability (`AGENTS.md` §2 Step 0's reuse
table: *"Alert a member at a point in time → `Reminder` + `ReminderOccurrence`
… Don't build: a module-specific scheduled-alert table"`) — a **direct
barrel call** (`createReminder()` from `@/modules/reminders`), not an
`EventSubscription`, per the canonical rule in `docs/project-structure.md`
§3.3: every built-in-to-built-in reaction is a direct function call through
`dependsOnModules`.

The categoryKey used to gate email/digest for a *firing* occurrence is
resolved from the Reminder's own `sourceType` — not a single flat
`reminder.due` for everything. This is this doc's resolution of an apparent
tension between two `plan.md` passages: §4.5 says occurrence-firing "emits a
`reminder.due` event" (true — see §6.1, that event is always raised, for the
`reminders` module's own audit trail and for a future automation rule to
react to "any reminder fired" generically); §3.1 and §9 Q24 separately imply
`bill.due_soon`/`budget.threshold_exceeded` are each their **own**
independently-toggleable category (*"budget threshold breach … is subject to
normal per-category notification opt-out"* — which only means something if
`budget.threshold_exceeded` is its own row in `NotificationPreference`,
distinct from every other reminder). Both are true at once: `reminder.due`
is always emitted as the platform event; the **notification-preference
gate** consulted at send-time uses the more specific key below, when one
exists, so a member can turn off budget alerts without losing renewal
reminders:

| `Reminder.sourceType` | categoryKey checked at fire-time | Owning module | Source of the key |
|---|---|---|---|
| `subscription` | `bill.due_soon` | `finance` | `plan.md` §4.7's emit list, `docs/seeding.md` §5.1's literal seeded key |
| `budget` | `budget.threshold_exceeded` | `finance` | `plan.md` §4.7's emit list |
| `renewal` | `renewal.expiring_soon` | `life_admin` | `plan.md` §4.8's emit list |
| `task` | `task.due_soon` | `tasks` | `plan.md` §4.2's emit list |
| `manual` / `document` / `other` | `reminder.due` | `reminders` | no more specific key exists — falls back to the generic one |

```ts
// src/lib/notifications/entities/notification-preference.ts
import type { ReminderSourceType } from "@prisma/client";

/**
 * Resolves which NotificationPreference.categoryKey gates a firing
 * ReminderOccurrence's email/digest delivery. See docs/email.md §2.2 for
 * why this isn't a flat "reminder.due" for every source type.
 */
export function resolveReminderCategoryKey(sourceType: ReminderSourceType): string {
  switch (sourceType) {
    case "subscription": return "bill.due_soon";
    case "budget": return "budget.threshold_exceeded";
    case "renewal": return "renewal.expiring_soon";
    case "task": return "task.due_soon";
    case "manual":
    case "document":
    case "other":
    default:
      return "reminder.due";
  }
}
```

Whichever categoryKey this resolves to, the **in-app surface is never
gated** — `plan.md` §4.5 is explicit that *"in-app visibility is unaffected
by [email] preferences"*: the `ReminderOccurrence` itself always shows up in
the target member's active-reminders list regardless of any toggle. Only
**email** (and, per §8, whether it rolls into the digest) is gated. This is
the one asymmetry versus Notification-backed categories, where
`inAppEnabled` controls whether a `Notification` row is written at all.

### 2.3 Registering a new category — `email_notification_category`

Per `plan.md` §6: *"each module contributes its own categories to a
platform notification category registry (surfaced via
`ModuleSurfaceRegistration(surface = email_notification_category)`), so a
new module's notifications automatically appear in each member's preference
screen without platform code changes."* Concretely, this doc's convention
is:

- `ModuleSurfaceRegistration.target` = the categoryKey string itself (e.g.
  `"task.assigned"`), so the Settings → Notifications screen can render one
  row per `surface = 'email_notification_category'` registration without a
  second lookup table.
- `label` = the human-facing name shown next to the toggles (e.g. "Task
  assigned to you").

```ts
// src/modules/tasks/module.manifest.ts (addition alongside eventTypes, docs/seeding.md §5.1)
export const surfaceRegistrations = [
  { surface: "navigation_item", label: "Tasks", target: "/tasks", sortOrder: 10 },
  { surface: "quick_capture_target", label: "Add a task", target: "tasks/quick-capture", sortOrder: 10 },
  { surface: "global_search_provider", label: "Tasks", target: "tasks/search", sortOrder: 10 },
  { surface: "email_notification_category", label: "Task assigned to you", target: "task.assigned", sortOrder: 10 },
];
```

**Known gap (see §12):** none of the manifests shown in `docs/seeding.md`
§5.1 currently register an `email_notification_category` row yet, for any
of the four seeded `ModuleEventType`s. Until every module that owns a
categoryKey adds one, the Settings → Notifications screen has nothing to
enumerate and must render a hardcoded fallback list of §2.1/§2.2's table
rows — a stopgap, not the intended end state. Adding these rows is a
one-line, additive change per module (same shape as every other
`surfaceRegistrations` entry) and should land before or alongside the
Settings → Notifications page itself.

---

## 3. `NotificationPreference`: the three independent toggles

Per member, per `categoryKey`: `emailEnabled` / `inAppEnabled` /
`digestEnabled`, each defaulting to `true` (`plan.md` §3.1). All three are
independent — turning off `emailEnabled` for `bill.due_soon` doesn't affect
whether that reminder still shows on the dashboard, and doesn't affect
whether it rolls into the weekly digest.

### 3.1 Seeding — mirrors `ModuleGrant`'s pattern exactly

A member has no reason to see a preference row for a category before one
exists, and every member needs one the moment a category exists. This is
the same "seed at creation, upsert on registry growth" shape
`docs/access-control.md` §7.1 already uses for `ModuleGrant` — reuse it, not
a bespoke variant:

```ts
// src/lib/notifications/actions/seed-preferences.ts
import { prisma } from "@/lib/db";

// The tenant-guard extension (src/lib/db/tenant-guard.ts) makes `prisma`'s
// own type incompatible with Prisma's plain `Prisma.TransactionClient` —
// derived from the extended client's own `$transaction` callback parameter
// instead, same pattern as `seedModuleGrantsForHousehold()` (docs/access-
// control.md §7.1) and `seedStarterCategories()`. NOT `PrismaClient |
// Prisma.TransactionClient` — that type doesn't match `tx`'s real shape.
type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Run once per member — at signup (owner) and at Invite acceptance
 * (everyone else) — inside the same transaction that creates the Member
 * row. Also safe to re-run (upsert) whenever a module registers a new
 * `email_notification_category` (§2.3): existing members pick up the new
 * category with the true/true/true defaults instead of silently having no
 * row (and therefore, per §3.2's fallback, still defaulting to "on" — this
 * just makes the row concrete and toggleable).
 */
export async function seedNotificationPreferencesForMember(db: Db, memberId: string, householdId: string) {
  const categories = await db.moduleSurfaceRegistration.findMany({
    where: { surface: "email_notification_category" },
    select: { target: true },
  });

  await db.notificationPreference.createMany({
    data: categories.map(({ target }) => ({
      householdId,
      memberId,
      categoryKey: target,
      emailEnabled: true,
      inAppEnabled: true,
      digestEnabled: true,
    })),
    skipDuplicates: true,
  });
}
```

### 3.2 Reading a preference — default to "on" if no row exists

Because §2.3's registrations are a known gap today, `resolveReminderCategoryKey()`
can return a key with no seeded `NotificationPreference` row yet. **Missing
row means "on," never "off"** — matching every field's stated default:

```ts
// src/lib/notifications/entities/notification-preference.ts (continued)
import { prisma } from "@/lib/db";

export async function getEffectivePreference(memberId: string, categoryKey: string) {
  const pref = await prisma.notificationPreference.findUnique({
    where: { memberId_categoryKey: { memberId, categoryKey } },
  });
  return {
    emailEnabled: pref?.emailEnabled ?? true,
    inAppEnabled: pref?.inAppEnabled ?? true,
    digestEnabled: pref?.digestEnabled ?? true,
  };
}
```

### 3.3 Updating preferences — a member manages only their own

```ts
// src/lib/notifications/actions/update-preferences.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function updateNotificationPreference(input: {
  categoryKey: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestEnabled: boolean;
}) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // No role check needed — every member (owner/admin/member alike) manages
  // only their own NotificationPreference rows; there is no "manage
  // someone else's notification settings" ability in plan.md.
  await prisma.notificationPreference.upsert({
    where: { memberId_categoryKey: { memberId: member.id, categoryKey: input.categoryKey } },
    create: { memberId: member.id, ...input },
    update: input,
  });

  revalidatePath("/settings/notifications");
}
```

`src/lib/notifications/actions/update-preferences.test.ts` covers: a member
updating their own preference (happy path), and — since this action never
reads `householdId` from the client — a test asserting the write always
targets `requireMember()`'s own `memberId`, never an id passed in
`input` (there isn't one to pass, which is the point).

---

## 4. `Notification`: the bell/inbox feed

One row per member per Notification-backed category firing (§2.1), written
by `dispatchToSubscribers()` (§6.2) only when that member's `inAppEnabled`
is on for the category:

```ts
// src/lib/notifications/actions/mark-read.ts
"use server";

import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function markNotificationRead(notificationId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // householdId AND memberId, both — never id alone (CLAUDE.md rule 1), and
  // memberId scopes to "mine" specifically, since a Notification's
  // recipient is the only person allowed to dismiss it.
  return prisma.notification.updateMany({
    where: { id: notificationId, householdId: member.householdId, memberId: member.id },
    data: { readAt: new Date() },
  });
}
```

```ts
// src/lib/notifications/queries/get-inbox.ts — real signature, not getUnreadNotifications():
// returns the 50 most recent rows (read AND unread, oldest-first-dropped),
// not an unread-only filter — the bell UI itself decides how to render
// read vs. unread (an "unread" dot/bold + a badge count derived client-side
// from readAt === null), rather than the query only ever returning a subset.
import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";

export async function getInbox(actingMember: Pick<ActingMember, "id" | "householdId">) {
  return prisma.notification.findMany({
    where: { householdId: actingMember.householdId, memberId: actingMember.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
```

`markAllNotificationsRead()` (`src/lib/notifications/actions/mark-all-read.ts`) is `markNotificationRead()`'s bulk sibling — same householdId+memberId scoping, but `updateMany({ readAt: null })` instead of a single id, for the bell's "Mark all read" button. The bell itself (`src/components/app-shell/notification-bell.tsx` + `notification-bell-button.tsx`) is the one real consumer of both `getInbox()` and these two actions — see AGENTS.md/`docs/project-structure.md` for why UI like this lives under `src/components/app-shell/`, not inside this `src/lib/` folder.

`fanOutNotificationsForOccurrence()`'s `Notification.create()` doesn't just stamp the event type's own generic `label` into `title` and leave `body`/`sourceEntityType`/`sourceEntityId` null — a per-category `buildNotificationDetail()` (same file) does one extra lookup to make the row actually useful: `task.assigned` fetches the `Task.title` and the assigner's `Member.displayName` to build `body: '{assigner} assigned you "{task title}"'`; `share.received` fetches the sharer's name for `body: '{sharer} shared a {objectType} with you'`. Both set `sourceEntityType`/`sourceEntityId` from the payload either way (even when the body lookup comes back empty), and both fall back to the bare generic label if the source row no longer resolves — a deleted task must never throw and break the whole fan-out. `household.invite_received` skips this entirely (falls straight to generic) since nothing ever actually emits it (§2.1's caveat) — there is no real occurrence to enrich.

---

## 5. `DigestSubscription`: independent of per-category prefs

One row per member (`plan.md` §3.1: 1:1), controlling a separate rolled-up
summary email — `off | daily | weekly`, a `timeOfDay` (`HH:mm`, default
`07:00`) interpreted in `Household.timezone`, and (for `weekly`) a
`dayOfWeek`. This is a second, independent gate on top of `digestEnabled`
per category (§3): a category can be `digestEnabled = true` and still never
appear in a digest email if the member's own `DigestSubscription.frequency`
is `off`.

```ts
// src/lib/notifications/actions/update-preferences.ts (continued)
export async function updateDigestSubscription(input: {
  frequency: "off" | "daily" | "weekly";
  dayOfWeek?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  timeOfDay: string; // "HH:mm"
}) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");
  if (input.frequency === "weekly" && !input.dayOfWeek) {
    throw new Error("dayOfWeek is required when frequency is weekly");
  }

  const household = await prisma.household.findUniqueOrThrow({ where: { id: member.householdId } });
  const nextRunAt = nextDigestRunAt(input, household.timezone, new Date());

  return prisma.digestSubscription.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, ...input, nextRunAt },
    update: { ...input, nextRunAt },
  });
}
```

`nextDigestRunAt()` lives in `src/lib/dates.ts` (§1), alongside the existing
`startOfHouseholdDay()`/`endOfHouseholdDay()` helpers — every "what time is
it in this household" computation is centralized in that one file rather
than each caller doing its own timezone math:

```ts
// src/lib/dates.ts (addition)
import { TZDate } from "@date-fns/tz"; // or your team's chosen tz-aware date helper

export function nextDigestRunAt(
  sub: { frequency: "off" | "daily" | "weekly"; dayOfWeek?: string; timeOfDay: string },
  timezone: string,
  from: Date,
): Date | null {
  if (sub.frequency === "off") return null;

  const [hour, minute] = sub.timeOfDay.split(":").map(Number);
  let candidate = new TZDate(from, timezone);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate <= from) candidate = addDays(candidate, 1);

  if (sub.frequency === "weekly" && sub.dayOfWeek) {
    while (dayOfWeekName(candidate) !== sub.dayOfWeek) {
      candidate = addDays(candidate, 1);
    }
  }
  return candidate;
}
```

---

## 6. The dispatch pipeline

`emitEvent()` (`docs/project-structure.md` §4.2) is the single entry point
every module's Server Action or job calls when something notable happens.
This section is the part of the pipeline that's this doc's concern — the
notification/email fan-out, as distinct from the `EventSubscription`
fan-out to other modules' reactions (`docs/module-architecture.md`'s job).

```ts
// src/lib/events/emit.ts
import { prisma } from "@/lib/db";
import { dispatchToSubscribers } from "./dispatch";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

// Runs synchronously, inline with the action — there is no message queue in
// V1. Call it LAST, after the primary write succeeds: if the action's own
// transaction rolls back after this call, the EventOccurrence row (and
// anything it triggered) is NOT rolled back with it.
export async function emitEvent(
  householdId: string,
  eventTypeKey: string,               // e.g. "task.assigned", "reminder.due"
  payload: Record<string, unknown>,
  triggeredByMemberId: string | null, // null for system/cron-triggered events (plan.md §3.6)
) {
  const eventType = await prisma.moduleEventType.findUniqueOrThrow({ where: { key: eventTypeKey } });

  const occurrence = (await prisma.eventOccurrence.create({
    data: {
      householdId,
      eventTypeId: eventType.id,
      emittedByModuleId: eventType.owningModuleId,
      occurredAt: new Date(),
      triggeredByMemberId,
      payloadSnapshot: payload,
      subscriptionsNotified: 0, // updated in place once dispatch finishes
    },
    include: { eventType: true },
  })) as EventOccurrence & { eventType: ModuleEventType };

  await dispatchToSubscribers(occurrence);
  return occurrence;
}
```

### 6.1 What `dispatchToSubscribers()` always does, unconditionally

Split across two files by concern, not one — `src/lib/events/dispatch.ts`
owns the `EventSubscription` fan-out (a 9th/custom module's optional
reaction) and calls straight into `src/lib/notifications/dispatch.ts`'s
`fanOutNotificationsForOccurrence()` for the notification/email half. This
runs for **every** `EventOccurrence`, unconditionally — a module never
opts into it by registering anything; it's baseline platform behavior
triggered purely by calling `emitEvent()` at all:

```ts
// src/lib/events/dispatch.ts
import { prisma } from "@/lib/db";
import { eventHandlers } from "./handlers";
import { fanOutNotificationsForOccurrence } from "@/lib/notifications/dispatch";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

const MAX_CONSECUTIVE_FAILURES = 5;

export async function dispatchToSubscribers(occurrence: EventOccurrence & { eventType: ModuleEventType }) {
  await fanOutNotificationsForOccurrence(occurrence);

  const subscriptions = await prisma.eventSubscription.findMany({
    where: { eventTypeId: occurrence.eventTypeId, active: true },
    include: { subscriberModule: true },
  });
  // ...fans out to each subscription's compiled handler, tracking
  // consecutiveFailureCount/onFailure semantics — see
  // docs/module-architecture.md, not this doc's concern.
}
```

```ts
// src/lib/notifications/dispatch.ts
import { prisma } from "@/lib/db";
import { getEffectivePreference } from "./entities/notification-preference";
import { sendCategoryEmail } from "@/lib/email/send-category-email";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

type Occurrence = EventOccurrence & { eventType: ModuleEventType };

// The only three Notification-backed categories (§2.1) — resolves each
// one's single recipient from the event's own payload shape, since
// EventOccurrence has no generic "recipient" concept.
const NOTIFICATION_BACKED_RECIPIENTS: Record<string, (payload: Record<string, unknown>) => string | null> = {
  "task.assigned": (payload) => (payload.assigneeId as string | undefined) ?? null,
  "share.received": (payload) => (payload.sharedWithMemberId as string | undefined) ?? null,
  "household.invite_received": (payload) => (payload.invitedMemberId as string | undefined) ?? null,
};

export async function fanOutNotificationsForOccurrence(occurrence: Occurrence) {
  const resolveRecipient = NOTIFICATION_BACKED_RECIPIENTS[occurrence.eventType.key];
  if (!resolveRecipient) return; // not a Notification-backed category — nothing to do here

  const payload = occurrence.payloadSnapshot as unknown as Record<string, unknown>;
  const recipientMemberId = resolveRecipient(payload);
  if (!recipientMemberId) return;

  const preference = await getEffectivePreference(occurrence.householdId, recipientMemberId, occurrence.eventType.key);

  if (preference.inAppEnabled) {
    await prisma.notification.create({
      data: {
        householdId: occurrence.householdId,
        memberId: recipientMemberId,
        categoryKey: occurrence.eventType.key,
        sourceModule: occurrence.eventType.key.split(".")[0],
        eventOccurrenceId: occurrence.id,
        title: occurrence.eventType.label,
      },
    });
  }

  if (preference.emailEnabled) {
    // Best-effort — see §7's resilience note. A Resend outage must never
    // break the action that triggered this event.
    try {
      await sendCategoryEmail(
        { ...payload, triggeredByMemberId: occurrence.triggeredByMemberId },
        recipientMemberId,
        occurrence.eventType.key,
      );
    } catch (error) {
      console.error(`Failed to send ${occurrence.eventType.key} email to member ${recipientMemberId}:`, error);
    }
  }
}
```

Notably, `household.invite_received`'s entry above is effectively dead
code today — nothing ever emits that event with an `invitedMemberId` in
its payload (see §2.1's note: the invitee has no `Member` row yet, so
`inviteMember()` sends its email directly via `sendHouseholdInviteEmail()`,
bypassing this whole pipeline). `share.received` is the one of these three
that's actually wired end-to-end, from `syncObjectShares()`
(`src/lib/household/actions/sync-object-shares.ts`).

### 6.2 Reminder-backed categories skip the `Notification` row, never skip the email check

The reminders-sweep job (§9.1) does **not** call `emitEvent("bill.due_soon", …)`
or similar per-source keys — those still get raised separately by the
*source* module's own sweep (§9.2–§9.4) for the audit trail (or, for
renewals, by `sweep-renewal-lifecycle.ts`, §9.4), using their own
`ModuleEventType`. What the reminders-sweep job does instead, on firing, is
call `sendCategoryEmail()` directly with the resolved key from §2.2 — it
deliberately bypasses the Notification-row branch above, because
`ReminderOccurrence` already is the in-app surface:

```ts
// src/modules/reminders/jobs/sweep-due-occurrences.ts (excerpt — full job in §9.1)
import { getEffectivePreference, resolveReminderCategoryKey } from "@/lib/notifications/entities/notification-preference";
import { sendCategoryEmail } from "@/lib/email/send-category-email";

async function deliverFiredOccurrence(reminder: Reminder, occurrence: ReminderOccurrence) {
  const categoryKey = resolveReminderCategoryKey(reminder.sourceType);
  const preference = await getEffectivePreference(reminder.householdId, reminder.targetMemberId, categoryKey);

  // plan.md §4.5: BOTH gates must be on — the reminder's own override AND
  // the member's category preference. In-app is never gated (§2.2).
  if (reminder.emailEnabled && preference.emailEnabled) {
    try {
      await sendCategoryEmail({ reminder, occurrence }, reminder.targetMemberId, categoryKey);
    } catch (error) {
      console.error(`Failed to send reminder email for occurrence ${occurrence.id}:`, error);
    }
  }
  // No Notification row — ReminderOccurrence.status is the in-app surface.
}
```

---

## 7. Resend integration

This codebase has no validated `@/lib/env` module (checked — every other
file reads `process.env.X` directly, e.g. `src/lib/supabase/admin.ts`,
`src/app/(auth)/actions.ts`); this file follows that same convention rather
than inventing one:

```ts
// src/lib/email/resend-client.ts
import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";

// Constructed lazily, inside the function below, not at module scope — the
// Resend SDK throws "Missing API key" the moment it's instantiated with an
// empty string, and a module-scope `new Resend(...)` would then throw the
// instant anything merely *imports* this file (e.g. `next build`'s page-
// data-collection phase for every Route Handler that transitively imports
// it), even in an environment with no RESEND_API_KEY configured yet and no
// intention of ever actually sending. A real, confirmed `pnpm build`
// failure — fixed by deferring construction to call time.
function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * The one function that ever calls the Resend SDK directly. Every email
 * this app sends — reminder firing, digest, anything — goes through this,
 * never a second ad-hoc Resend client instantiated elsewhere.
 */
export async function sendTransactionalEmail(input: { to: string; subject: string; react: ReactElement }) {
  // ROADMAP.md: "no simulated/logged sends, ever — including in dev, use a
  // Resend test-mode/sandbox recipient instead of stubbing the provider."
  // EMAIL_DEV_REDIRECT_TO is optional and only ever applies outside
  // production — every environment still makes a real Resend API call.
  const to =
    process.env.NODE_ENV === "production" || !process.env.EMAIL_DEV_REDIRECT_TO
      ? input.to
      : process.env.EMAIL_DEV_REDIRECT_TO;

  return getResendClient().emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: input.subject,
    react: input.react,
  });
}
```

This is real for local dev too — `EMAIL_DEV_REDIRECT_TO` (an additional env
var alongside README.md's table, e.g. your own inbox) just changes the
envelope recipient, it never swaps in a fake/logging implementation of
`sendTransactionalEmail()` itself. Unit tests are the one place the Resend
SDK boundary is mocked (`vi.mock("resend")`, §10) — that's a normal
network-boundary test double, not "simulating a send" in the sense
ROADMAP.md's decision forbids (which is about the running application never
faking a send).

Every call site above `sendTransactionalEmail()`/`sendCategoryEmail()` that
isn't the sole delivery mechanism for its triggering action wraps the call
in try/catch and only logs on failure (`fanOutNotificationsForOccurrence()`,
`deliverFiredOccurrence()` in §6.2, `sendDueDigests()`'s per-member loop in
§8) — a Resend outage must never break task creation, reminder firing, or
an unrelated member's digest. The one exception is `inviteMember()`'s
invite email (§2.1/§11): it's the *only* delivery mechanism for that
`Invite`, so a failed send there rolls back the row and surfaces a real
error instead of swallowing it.

### 7.1 Templates — react-email components, one per category (mostly)

```
src/lib/email/templates/
├── reminder-firing.tsx       # generic — manual, task, renewal, budget, document sourceTypes
├── bill-due-soon.tsx         # used instead of reminder-firing.tsx when sourceType = "subscription"
├── task-assigned.tsx
├── share-received.tsx
├── household-invite-received.tsx
└── digest.tsx                # §8's rollup email
```

Each template file exports the component plus a plain sibling function for
its subject line (`reminderFiringSubject()`, `billDueSoonSubject()`, …) —
not a `Component.subjectFor()` static property attached to the function, as
an earlier draft of this doc showed. Attaching statics to a function
component works at runtime but fights TypeScript's component typing for no
real benefit; `send-category-email.tsx` imports the subject function
directly alongside the component.

`bill-due-soon.tsx` isn't a second delivery path — it's a nicer-copy
*template variant* of the same `reminder.due`-firing pipeline in §6.2 and
§9.1, selected by `Reminder.sourceType` rather than a separate categoryKey
gate ("Your Netflix bill is due in 3 days" instead of a generic "Reminder:
Netflix"). This reconciles `plan.md` §4.5 (one generic firing mechanism for
every Reminder, regardless of source) with `ROADMAP.md` §8's explicit
requirement of a distinct "bill due soon" template:

```tsx
// src/lib/email/send-category-email.tsx (a .tsx file — it renders JSX)
import "server-only";
import type { Reminder, ReminderOccurrence } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "./resend-client";
import { ReminderFiringEmail, reminderFiringSubject } from "./templates/reminder-firing";
import { BillDueSoonEmail, billDueSoonSubject } from "./templates/bill-due-soon";
import { TaskAssignedEmail, taskAssignedSubject } from "./templates/task-assigned";
import { ShareReceivedEmail, shareReceivedSubject } from "./templates/share-received";

type ReminderFiringContext = { reminder: Reminder; occurrence: ReminderOccurrence };

export async function sendCategoryEmail(
  context: ReminderFiringContext | Record<string, unknown>,
  memberId: string,
  categoryKey: string,
) {
  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  if ("reminder" in context && context.reminder) {
    const { reminder } = context as ReminderFiringContext;
    if (reminder.sourceType === "subscription") {
      return sendTransactionalEmail({
        to: member.email,
        subject: billDueSoonSubject(reminder),
        react: <BillDueSoonEmail reminder={reminder} />,
      });
    }
    return sendTransactionalEmail({
      to: member.email,
      subject: reminderFiringSubject(reminder),
      react: <ReminderFiringEmail reminder={reminder} />,
    });
  }

  switch (categoryKey) {
    case "task.assigned": {
      // Only taskId/assigneeId are in the emitted payload (docs/module-
      // architecture.md's payloadSummary convention) — the title and who
      // assigned it are fetched here, not carried in the event.
      const { taskId, triggeredByMemberId } = context as { taskId: string; triggeredByMemberId: string | null };
      const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      const assignedBy = triggeredByMemberId
        ? await prisma.member.findUnique({ where: { id: triggeredByMemberId } })
        : null;
      return sendTransactionalEmail({
        to: member.email,
        subject: taskAssignedSubject(),
        react: <TaskAssignedEmail taskTitle={task.title} assignedByName={assignedBy?.displayName ?? "Someone"} />,
      });
    }
    case "share.received": {
      const { objectType, sharedByMemberId } = context as { objectType: string; sharedByMemberId: string };
      const sharedBy = await prisma.member.findUniqueOrThrow({ where: { id: sharedByMemberId } });
      return sendTransactionalEmail({
        to: member.email,
        subject: shareReceivedSubject(),
        react: <ShareReceivedEmail objectType={objectType} sharedByName={sharedBy.displayName} />,
      });
    }
    default:
      throw new Error(`No email template registered for categoryKey "${categoryKey}"`);
  }
}
```

`household.invite_received` deliberately has **no** case in this switch —
per §2.1/§6.1, it's never actually routed through `sendCategoryEmail()`.
Its email goes out via a separate, small function in the same file that
bypasses the whole `memberId`/`categoryKey` contract above, called directly
from `inviteMember()`:

```tsx
// src/lib/email/send-category-email.tsx (continued)
import { HouseholdInviteReceivedEmail, householdInviteReceivedSubject } from "./templates/household-invite-received";

export async function sendHouseholdInviteEmail(input: {
  to: string;
  householdName: string;
  invitedByName: string;
  acceptUrl: string;
}) {
  return sendTransactionalEmail({
    to: input.to,
    subject: householdInviteReceivedSubject(input.householdName),
    react: <HouseholdInviteReceivedEmail {...input} />,
  });
}
```

```tsx
// src/lib/email/templates/reminder-firing.tsx
import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

export function reminderFiringSubject(reminder: { title: string }) {
  return `Reminder: ${reminder.title}`;
}

export function ReminderFiringEmail({ reminder }: { reminder: { title: string; description: string | null } }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>{reminder.title}</Heading>
          {reminder.description && <Text>{reminder.description}</Text>}
          <Button href={`${process.env.NEXT_PUBLIC_SITE_URL}/reminders`}>View reminder</Button>
        </Container>
      </Body>
    </Html>
  );
}
```

No deep link resolved via `resolveSourceEntity()` — that helper (mentioned
in an earlier draft of this doc via `docs/orm-conventions.md` §4.1) doesn't
actually exist anywhere in the codebase; the link always points at the
owning module's list page (`/reminders`, `/finance/subscriptions`, …), a
simpler and equally correct destination.

---

## 8. The digest composition job

Rolls up, per member with an active `DigestSubscription`, every
`digestEnabled = true` category since the last send — **both** unread
`Notification` rows and `pending`/`notified` `ReminderOccurrence` rows, since
"a rolled-up summary of what needs your attention" spans both mechanisms
from §2:

```tsx
// src/lib/notifications/jobs/send-digests.tsx (a .tsx file — it renders JSX)
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/resend-client";
import { DigestEmail, digestSubject } from "@/lib/email/templates/digest";
import { nextDigestRunAt } from "@/lib/dates";
import { resolveReminderCategoryKey } from "@/lib/notifications/entities/notification-preference";

export async function sendDueDigests(now = new Date()) {
  const due = await prisma.digestSubscription.findMany({
    where: { frequency: { not: "off" }, nextRunAt: { lte: now } },
    include: { member: { include: { household: true } } },
  });

  let sent = 0;

  for (const sub of due) {
    // Claim by advancing nextRunAt atomically BEFORE any side effect
    // (§9.7) — guarded by the exact nextRunAt just read, so a second
    // overlapping invocation sees claimed.count === 0 and skips it. If the
    // process dies right after this: one skipped digest, never a
    // duplicate send.
    const advancedNextRunAt = nextDigestRunAt(sub, sub.member.household.timezone, now);
    const claimed = await prisma.digestSubscription.updateMany({
      where: { id: sub.id, householdId: sub.householdId, nextRunAt: sub.nextRunAt },
      data: { nextRunAt: advancedNextRunAt, lastSentAt: now },
    });
    if (claimed.count === 0) continue;

    // Missing NotificationPreference row means digestEnabled defaults to
    // "on" (§3.2) — fetch every preference row, not just the ones already
    // digestEnabled: true, so a category with no row yet is still included.
    const preferences = await prisma.notificationPreference.findMany({
      where: { householdId: sub.householdId, memberId: sub.memberId },
    });
    const preferenceByCategoryKey = new Map(preferences.map((pref) => [pref.categoryKey, pref]));
    const isDigestEnabled = (categoryKey: string) => preferenceByCategoryKey.get(categoryKey)?.digestEnabled ?? true;

    const [allUnread, allActive] = await Promise.all([
      prisma.notification.findMany({
        where: { householdId: sub.householdId, memberId: sub.memberId, readAt: null },
      }),
      prisma.reminderOccurrence.findMany({
        where: {
          householdId: sub.householdId,
          status: { in: ["pending", "notified"] },
          reminder: { targetMemberId: sub.memberId },
        },
        include: { reminder: true },
      }),
    ]);

    const notifications = allUnread.filter((notification) => isDigestEnabled(notification.categoryKey));
    const occurrences = allActive.filter((occurrence) =>
      isDigestEnabled(resolveReminderCategoryKey(occurrence.reminder.sourceType)),
    );

    if (notifications.length === 0 && occurrences.length === 0) continue; // nextRunAt already advanced above

    try {
      await sendTransactionalEmail({
        to: sub.member.email,
        subject: digestSubject(sub.frequency === "daily" ? "daily" : "weekly"),
        react: <DigestEmail notifications={notifications} occurrences={occurrences} />,
      });
      sent++;
    } catch (error) {
      console.error(`Failed to send digest to member ${sub.memberId}:`, error);
    }
  }

  return { checked: due.length, sent };
}
```

---

## 9. Background jobs & scheduled triggers

Per `plan.md` §6: *"because email must be sent even when no member has the
app open, a scheduled/background job capability … is required."* Vercel has
no long-running server process, so every sweep is a thin, `CRON_SECRET`-gated
`app/api/cron/*/route.ts` Route Handler (`docs/project-structure.md` §6),
hit on a fixed schedule by an external caller — a GitHub Actions workflow
(§9.6), not Vercel's own Cron feature (Hobby-plan frequency limits made
that a non-starter for the two sub-daily jobs — see §9.6's finding). All
five routes share one shape: verify `CRON_SECRET`, call one job function,
return.

### 9.1 `reminders-sweep` — every 15 minutes

```ts
// src/modules/reminders/jobs/sweep-due-occurrences.ts
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
// deliverFiredOccurrence (§6.2) lives in this same file, not a separate
// ./deliver-fired-occurrence.ts — it's small and used only here.

const MISSED_GRACE_HOURS = 24; // plan.md §9 Q14

export async function sweepDueOccurrences(now = new Date()) {
  // 1. Fire everything due: pending -> notified, atomically claimed so two
  //    overlapping cron invocations can't both "fire" the same occurrence.
  const claimed = await prisma.reminderOccurrence.updateMany({
    where: { status: "pending", remindAt: { lte: now } },
    data: { status: "notified", notifiedAt: now },
  });

  if (claimed.count > 0) {
    const justFired = await prisma.reminderOccurrence.findMany({
      where: { status: "notified", notifiedAt: now },
      include: { reminder: true },
    });
    for (const occurrence of justFired) {
      await emitEvent(
        occurrence.reminder.householdId,
        "reminder.due",
        { reminderId: occurrence.reminderId, occurrenceId: occurrence.id, remindAt: occurrence.remindAt },
        null, // system-triggered
      );
      await deliverFiredOccurrence(occurrence.reminder, occurrence); // §6.2 — includes its own try/catch
    }
  }

  // 2. Grace-window sweep: notified -> missed after 24h unacknowledged.
  const missedCutoff = new Date(now.getTime() - MISSED_GRACE_HOURS * 60 * 60 * 1000);
  const missed = await prisma.reminderOccurrence.updateMany({
    where: { status: "notified", notifiedAt: { lte: missedCutoff } },
    data: { status: "missed" },
  });

  // 3. Lazily generating the next occurrence for any reminder whose only
  //    live occurrence just reached a terminal state is NOT implemented —
  //    a real, tracked gap (ROADMAP.md's "Known harness gaps"). Recurring
  //    reminders currently fire their first occurrence and never
  //    regenerate a second one; dismissed/completed/snoozed-expiry
  //    happen from the acknowledgement Server Actions, not this job,
  //    regardless.

  return { fired: claimed.count, missed: missed.count };
}
```

### 9.2 `subscriptions-sweep` — daily at 06:00

Built in an earlier phase (Finance module), before this doc's §9.1/§9.4
sections existed — the real file/function names differ slightly from this
section's illustrative names, not yet reconciled here:
`src/modules/finance/jobs/sweep-subscription-due-dates.ts`,
`sweepSubscriptionDueDates()`. Shape is otherwise as shown:

```ts
// sweep-subscription-due-dates.ts (excerpt — autoCreateTransaction handling
// and nextDueDate/lastPaidDate advancement are the Finance module's own concern, not this doc's)
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { createReminder } from "@/modules/reminders";
import { addDays } from "date-fns";

export async function sweepSubscriptions(now = new Date()) {
  const dueSoon = await prisma.subscription.findMany({
    where: { status: "active" },
  });

  for (const sub of dueSoon) {
    const alertFrom = addDays(sub.nextDueDate, -sub.alertDaysBefore);
    if (alertFrom > now) continue;

    // Audit-trail / future-automation event — separate from the member alert below.
    await emitEvent(sub.householdId, "bill.due_soon", { subscriptionId: sub.id, nextDueDate: sub.nextDueDate }, null);

    // The actual member-facing alert: a direct call into the shared Reminder
    // capability (AGENTS.md §2 Step 0), not an EventSubscription reaction.
    await createReminder({
      householdId: sub.householdId,
      title: sub.name, // snapshot — not synced to later renames, plan.md §3.3
      targetMemberId: sub.responsibleMemberId,
      reminderType: "one_off",
      sourceType: "subscription",
      sourceModule: "finance",
      sourceEntityId: sub.id,
      firstRemindAt: alertFrom,
    });
  }
}
```

### 9.3 `budgets-sweep` — daily at 06:00

Fans out to every active member when the budget is whole-household
(`memberId = null`), per `plan.md` §9 Q25 — one `Reminder` row per member,
since `Reminder.targetMemberId` is single-recipient only (no
`ReminderRecipient` until V2). Built in an earlier phase; real file/function
names are `sweep-budget-thresholds.ts`/`sweepBudgetThresholds()`, and the
"already alerted this period" idempotency check below is actually
implemented (queries `Reminder` for one already `active`/`paused` since the
period start), not left as a TODO comment as an earlier draft of this doc
showed:

```ts
// sweep-budget-thresholds.ts (excerpt)
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { emitBudgetThresholdExceeded } from "../events/emitters";
import { getCurrentPeriodRange } from "../entities/budget"; // Budget vs Transaction sum, this period

export async function sweepBudgetThresholds() {
  const budgets = await prisma.budget.findMany({ where: { alertOnExceeded: true }, include: { category: true } });

  for (const budget of budgets) {
    const { start, end } = getCurrentPeriodRange(budget.period, new Date());
    const spendResult = await prisma.transaction.aggregate({
      where: { householdId: budget.householdId, categoryId: budget.categoryId, type: "expense", status: "posted", date: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    const percentUsed = (Number(spendResult._sum.amount ?? 0) / Number(budget.amount)) * 100;
    if (percentUsed < budget.alertThresholdPercent) continue;

    const alreadyAlerted = await prisma.reminder.findFirst({
      where: { householdId: budget.householdId, sourceType: "budget", sourceEntityId: budget.id, status: { in: ["active", "paused"] }, createdAt: { gte: start } },
    });
    if (alreadyAlerted) continue;

    await emitBudgetThresholdExceeded(budget.householdId, budget.id);

    const targetMemberIds = budget.memberId
      ? [budget.memberId]
      : (await prisma.member.findMany({ where: { householdId: budget.householdId, status: "active" }, select: { id: true } })).map((m) => m.id);

    for (const targetMemberId of targetMemberIds) {
      await createReminder({
        householdId: budget.householdId,
        title: `Budget alert: ${budget.categoryId}`,
        targetMemberId,
        reminderType: "one_off",
        sourceType: "budget",
        sourceModule: "finance",
        sourceEntityId: budget.id,
        firstRemindAt: new Date(), // event-driven source, no future anchor date — plan.md §3.3
      });
    }
  }
}
```

### 9.4 `renewals-sweep` — daily at 06:00

**Not** the `emitEvent` + `createReminder` pair §9.2/§9.3 use — an earlier
draft of this doc showed that shape, but it would create a **duplicate**
`Reminder` for every renewal, every single day the sweep runs. Unlike a
`Subscription`/`Budget` alert (event-driven, no future anchor date, fires
once right when the threshold is crossed), a `Renewal`'s `Reminder`s are
already created **eagerly**, one per `reminderOffsetsDays` entry, at
`Renewal` creation/update time — `regenerateRenewalReminders()`
(`src/modules/life-admin/actions/regenerate-renewal-reminders.ts`, called
from `create-renewal.ts`/`update-renewal.ts`) cancels the old set and
creates a new one whenever `expiryDate`/offsets change, per `plan.md` §4.8.
Those Reminders' own `firstRemindAt` is already in the future (`expiryDate`
minus the offset); reminders-sweep (§9.1) is what actually delivers them
when their time comes, exactly like any other Reminder.

So what does `renewals-sweep` do, if not create Reminders? It's
audit-trail/automation-hook only, per docs/email.md's own general framing
of `renewal.expiring_soon`/`renewal.expired` (`plan.md` §4.8's `Emits:`
line) — and it does **not** drive the `active → expiring_soon → expired`
status transitions either; those stay a derived, read-time-only value
(`getRenewalLifecycleStatus()`, `src/modules/life-admin/entities/renewal.ts`
— its own comment explains why: "never written back by a cron job," the
same derive-don't-store ADR as `Task`'s `getTaskStatus()`):

```ts
// src/modules/life-admin/jobs/sweep-renewal-lifecycle.ts
import { prisma } from "@/lib/db";
import { getRenewalLifecycleStatus } from "../entities/renewal";
import { emitRenewalExpiringSoon, emitRenewalExpired } from "../events/emitters";

export async function sweepRenewalLifecycle(now = new Date()) {
  const candidates = await prisma.renewal.findMany({ where: { status: "active" } });

  let expiringSoonAlerted = 0;
  let expiredAlerted = 0;

  for (const renewal of candidates) {
    const lifecycleStatus = getRenewalLifecycleStatus(renewal, now);
    if (lifecycleStatus === "active") continue;

    const sinceCycleStart = renewal.lastRenewedAt ?? renewal.createdAt;
    const eventTypeKey = lifecycleStatus === "expired" ? "renewal.expired" : "renewal.expiring_soon";

    // Idempotency: only ever emit once per lifecycle window per renewal.
    // A read-only existence check, not an atomic claim (§9.7) — unlike
    // reminders-sweep, this event has no email/Reminder side effect of its
    // own (that already happened at Renewal creation time), so a
    // duplicate audit-log row from a rare overlapping invocation is
    // harmless, never a duplicate email.
    const alreadyEmitted = await prisma.eventOccurrence.findFirst({
      where: {
        householdId: renewal.householdId,
        eventType: { key: eventTypeKey },
        occurredAt: { gte: sinceCycleStart },
        payloadSnapshot: { path: ["renewalId"], equals: renewal.id },
      },
    });
    if (alreadyEmitted) continue;

    if (lifecycleStatus === "expired") {
      await emitRenewalExpired(renewal.householdId, renewal.id);
      expiredAlerted++;
    } else {
      await emitRenewalExpiringSoon(renewal.householdId, renewal.id, renewal.expiryDate);
      expiringSoonAlerted++;
    }
  }

  return { checked: candidates.length, expiringSoonAlerted, expiredAlerted };
}
```

### 9.5 `digests-send` — hourly

```ts
// src/app/api/cron/digests-send/route.ts
import { sendDueDigests } from "@/lib/notifications/jobs/send-digests";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendDueDigests();
  return Response.json(result);
}
```

Running hourly, not once at each member's exact `timeOfDay`, is deliberate:
`nextRunAt` is checked with `lte: now`, so a member whose `timeOfDay` falls
between two hourly ticks gets picked up on the next tick, not held until the
following day. A 15-minute reminders-sweep cadence would give tighter
digest-time accuracy too, but the product plan doesn't require minute-level
digest precision, so hourly keeps the cron entry count and invocation
volume down.

### 9.6 The route handler pattern + who calls it

Every one of the five routes is this shape, verbatim except for which job
it calls (`docs/project-structure.md` §6):

```ts
// src/app/api/cron/reminders-sweep/route.ts
import { sweepDueOccurrences } from "@/modules/reminders/jobs/sweep-due-occurrences";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sweepDueOccurrences();
  return Response.json(result);
}
```

The route handlers don't know or care who calls them — only that the
caller presents the right `CRON_SECRET`. **Real deployment finding**:
`vercel.json`'s own `crons` array (the original plan) was rejected at
deploy time — `reminders-sweep` (every 15 min) and `digests-send` (hourly)
both exceed Vercel's Hobby-plan limit of once-per-day cron schedules, and
this project runs on Hobby, not Pro. Rather than degrading either job's
frequency (a real UX regression — reminders firing at most once a day)
or paying for Pro, the caller was swapped for a free GitHub Actions
scheduled workflow (`.github/workflows/cron.yml`) hitting the same routes
on an equivalent schedule:

```yaml
# .github/workflows/cron.yml (abridged — see the real file for the full case statement)
on:
  schedule:
    - cron: "*/15 * * * *" # reminders-sweep
    - cron: "0 * * * *" # digests-send
    - cron: "0 6 * * *" # subscriptions-sweep, budgets-sweep, renewals-sweep
  workflow_dispatch: {}
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/<job>"
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          SITE_URL: ${{ vars.SITE_URL }}
```

Requires two GitHub repo settings (Settings → Secrets and variables →
Actions): a `CRON_SECRET` **secret** matching the same value set on Vercel,
and a `SITE_URL` **variable** set to the deployed URL. `vercel.json` is
deliberately left with no `crons` key — if this project ever moves to
Vercel Pro, restoring the original array there (and deleting the workflow)
is a clean, isolated revert.

### 9.7 Idempotency — cron invocations can overlap, jobs must tolerate it

Vercel Cron doesn't guarantee mutual exclusion between invocations (a slow
run can still be executing when the next tick fires). Every job in this
doc follows the same rule: **claim rows with an atomic `updateMany` guarded
by their current status, before doing anything with side effects** (§9.1's
`pending → notified` claim is the canonical example) — never `findMany` a
list of "due" rows and then loop over them mutating one at a time, since a
second overlapping invocation would see the same "due" list before the
first invocation's writes land. Sending two reminder emails for the same
occurrence because of an overlapping cron tick is exactly the bug this
pattern prevents.

---

## 10. Testing conventions

Per `CLAUDE.md` rule 4, tests are colocated and land in the same change as
the code:

| What | Where | Shape |
|---|---|---|
| `resolveReminderCategoryKey()` | `src/lib/notifications/entities/notification-preference.test.ts` | pure function, one case per `sourceType` |
| `getEffectivePreference()` default-to-true fallback | same file | seed a member with no `NotificationPreference` row, assert all three come back `true` |
| `updateNotificationPreference()` | `src/lib/notifications/actions/update-preferences.test.ts` | happy path (own preference) + the "no id in `input`" scoping assertion |
| `markNotificationRead()` | `src/lib/notifications/actions/mark-read.test.ts` | happy path + rejected path (another member's `notificationId` updates 0 rows, never throws information about its existence) |
| `markAllNotificationsRead()` | `src/lib/notifications/actions/mark-all-read.test.ts` | happy path (scoped `updateMany` on `readAt: null`) + rejected path (not authenticated) |
| `getInbox()` | `src/lib/notifications/queries/get-inbox.test.ts` | scoped by householdId AND memberId, ordered newest-first, `take: 50` |
| `sweepDueOccurrences()` | `src/modules/reminders/jobs/sweep-due-occurrences.test.ts` | seed a past-due `pending` occurrence, assert it's `notified` + an email was attempted; seed a stale `notified` one past 24h, assert it's `missed` |
| `sendCategoryEmail()` template selection | `src/lib/email/send-category-email.test.ts` | `sourceType: "subscription"` picks `BillDueSoonEmail`, everything else picks `ReminderFiringEmail` |
| Resend boundary | any test that would otherwise send real email | `vi.mock("resend")` at the top of the test file — this is a network-boundary test double, not "simulating a send" in the app itself (§7) |

```ts
// src/lib/email/send-category-email.test.ts (excerpt)
import { vi, describe, it, expect } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "test" }) },
  })),
}));

describe("sendCategoryEmail", () => {
  it("uses BillDueSoonEmail for a subscription-sourced reminder", async () => {
    // ...assert the Resend mock's `react` prop is a BillDueSoonEmail element
  });
});
```

---

## 11. Checklist: wiring a new module's category into this pipeline

1. Register the `ModuleEventType` in the module's `module.ts`
   (`docs/seeding.md` §5.1) — upsert-by-key, so `emitEvent()` can resolve it.
2. Add an `email_notification_category` `surfaceRegistrations` entry with
   `target` = the categoryKey string (§2.3), so Settings → Notifications
   picks it up with zero platform code changes.
3. Decide: does this category deliver via a fresh `Notification` row (§2.1,
   the module calls `emitEvent()` directly for something that just
   happened), or via a `Reminder` the module creates through the shared
   capability (§2.2, something that should alert someone at a future point
   in time)? Don't build a third path — every category is one of these two.
4. If Reminder-backed, add the `sourceType → categoryKey` mapping to
   `resolveReminderCategoryKey()` (§2.2) — this is the one shared function
   every source-specific category must register itself in.
5. Add (or reuse) an email template under `src/lib/email/templates/` and
   wire it into `sendCategoryEmail()`'s switch (§7.1).
6. Add the categoryKey to `seedNotificationPreferencesForMember()`'s
   coverage — automatic once step 2's registration exists (§3.1 queries the
   registry, not a hardcoded list).
7. Tests: the categoryKey's resolution (if Reminder-backed) and the
   template-selection branch, at minimum (§10).

---

## 12. Known gaps to close before this pipeline is fully wired

Flagged here rather than glossed over, matching `docs/seeding.md`'s own
practice of stating exactly what's missing instead of implying it's already
handled:

- **No built-in module yet registers an `email_notification_category`
  surface row** (§2.3) — none of `docs/seeding.md` §5.1's manifests include
  one today. Settings → Notifications has nothing to enumerate until at
  least `tasks` (`task.assigned`), `reminders` (`reminder.due`), `finance`
  (`bill.due_soon`, `budget.threshold_exceeded`), and `life_admin`
  (`renewal.expiring_soon`) each add theirs.
- **`digests-send`'s "already alerted this period" de-duplication** for
  `budgets-sweep` (§9.3) is called out inline as a real implementation
  requirement (don't re-fire a budget alert every single day once a
  household is over threshold) but isn't fully specified here — track it as
  Finance module scope, not an email-pipeline concern, when that module's
  own doc is written.
