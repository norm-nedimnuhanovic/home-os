# Seeding

How a fresh clone of Home OS gets a working local database: one seeded
`Household` ("The Rivera Household") with three `Member`s across all three
roles, representative sample data across all 8 built-in modules, and the
platform catalog rows (`Module`, `ModuleEventType`, `ModulePermissionDeclaration`,
`ModuleSurfaceRegistration`, `ModuleGrant`) those 8 modules need to actually
work — so `pnpm prisma db seed` is enough to open the app and see a
*connected* system (a `Renewal` with reminders already generated, a
`Subscription` linked to a `Reminder`, a `Note` linked to a `Task`, a settled
`TransactionSplit`), not 8 empty screens.

> **Companion docs:** [plan.md](../plan.md) (every entity/field referenced
> below), [ROADMAP.md](../ROADMAP.md) (field-name source of truth this doc
> follows verbatim), [AGENTS.md](../AGENTS.md) (quick orientation and the
> new-module checklist), `docs/project-structure.md` (the project-structure
> source of truth per `docs/resources.md` §0's resolution rule, and the
> `src/modules/<key>/module.ts` registration shape §2 reuses here),
> `docs/access-control.md` (§7.1's `seedModuleGrantsForHousehold()`, reused
> rather than reimplemented — §3 below), `docs/auth.md` (the `Member` schema
> and Supabase Auth client helpers this doc builds sample logins on top of).
> `docs/orm-conventions.md` doesn't exist yet — where this doc has to guess at a
> Prisma detail that file hasn't decided yet, it says so inline instead of
> silently picking one.
>
> **Naming note:** this doc follows `docs/auth.md`'s `Member.supabaseUserId`
> field name and `@/lib/db` client import path, since that doc owns the
> canonical `Member` schema block. `docs/access-control.md`'s examples use
> `authUserId` / `@/lib/db` for the same things — align both call sites to
> whatever `docs/orm-conventions.md` finalizes. Same kind of drift, one more
> spot: `AGENTS.md`'s own worked example still spells this file
> `modules/<key>/module.ts` (no `src/` prefix, no `.manifest` suffix) with a
> `src/modules/platform/` registry; this doc uses `docs/project-structure.md`'s
> `src/modules/<key>/module.ts` / `src/lib/module-registry/registry.ts`
> instead, since `docs/resources.md` §0 already settled that
> `docs/project-structure.md` "wins on where files go and what things are
> named" whenever the harness's docs disagree.

---

## 1. Prerequisites

Seeding assumes Phase 0 of `ROADMAP.md` is done: `prisma/schema.prisma` has
real models for at least `Household`/`Member` and you can run `pnpm prisma
migrate dev`. On top of that, seeding needs one more dev dependency:

```bash
pnpm add -D tsx
```

`tsx` runs `prisma/seed.ts` directly (TypeScript, no separate build step) and
resolves the project's `@/*` tsconfig path alias automatically — no separate
seed-specific `tsconfig.json` needed.

Wire it into `package.json` so `prisma db seed` (and `migrate dev` /
`migrate reset`, which call the same script — see §4) know what to run:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

One more env var, added to `.env.example` alongside the ones in the root
`README.md`'s table:

```bash
# .env — never set this in a Vercel Production/Preview environment variable
ALLOW_DEV_SEED_AUTH_USERS=false
```

What it's for and why it defaults `false` is §5.2.

---

## 2. File layout

```
prisma/
├── schema.prisma                   # (existing — single file, one banner-commented
│                                   #  section per module; docs/project-structure.md §5)
├── seed.ts                        # entrypoint — orchestrates, in dependency order
├── seed/
│   ├── constants.ts                # fixed seed IDs + dev password, see §5.3
│   ├── platform.ts                 # seedPlatformCatalog() — walks src/lib/module-registry/registry.ts
│   ├── reset.ts                    # resetSeedHousehold() — wipes the PRIOR seed run
│   ├── household.ts                # seedHouseholdAndMembers() — Household + 3 Members
│   ├── tasks-kanban-calendar.ts    # Tag, KanbanBoard/Columns, Task(s), Event(s)
│   ├── reminders-notes.ts          # Reminder, Note(s), NoteLink
│   ├── finance.ts                  # Category, Subscription, Transaction/Split/Settlement, Budget
│   └── life-admin.ts               # Renewal, Contact, ShoppingList/Items
└── migrations/

src/
├── lib/
│   └── module-registry/
│       └── registry.ts             # barrel every module.ts registers into (§5.2)
└── modules/
    ├── tasks/module.ts        # this module's own Module/EventType/... rows
    ├── kanban/module.ts
    ├── calendar/module.ts
    ├── reminders/module.ts
    ├── notes/module.ts
    ├── finance/module.ts
    ├── life-admin/module.ts   # folder is kebab-case; Module.key inside is `life_admin`
    │                                   # (snake_case) — see the callout in §5.1, don't conflate them
    └── dashboard/module.ts
```

`src/lib/module-registry/registry.ts` and the eight
`src/modules/<key>/module.ts` files aren't new to this doc — they're
`docs/project-structure.md`'s own tree (§2, §4.3) and its §9
registration-checklist shape; this doc is where that shape gets used for
real, for all 8 built-ins, and where `prisma/seed/platform.ts` consumes it
generically instead of hardcoding each module inline.

---

## 3. Two idempotency strategies — don't mix them up

`pnpm prisma db seed` must be safe to run over and over (every `migrate dev`
re-runs it — see §4). Home OS's platform catalog and its household sample
data have different lifetimes, so they use different strategies:

| Data | Strategy | Why |
|---|---|---|
| Platform catalog — `Module`, `ModuleEventType`, `ModulePermissionDeclaration`, `ModuleSurfaceRegistration` | **Upsert by natural unique key** (`Module.key`, `ModuleEventType.key`, …) | Not household-scoped — shared, permanent, platform-wide rows. A blind `createMany` would duplicate them on every re-run; a wipe-and-recreate would orphan any `ModuleGrant`/`EventSubscription` FK pointing at the old rows. |
| Household sample data — everything under the fixed `SEED_HOUSEHOLD_ID` | **Delete-then-recreate**, scoped to that one household id | Simpler than dozens of per-row upserts, and safe *because* it's scoped to a household id nothing else in the database ever legitimately uses. Never do this against a real household. |

`SEED_HOUSEHOLD_ID` is a fixed, hardcoded string (§5.3) — never
`cuid()`-generated — specifically so `prisma/seed/reset.ts` (§6) can find and
delete last run's rows before recreating them.

---

## 4. Running it

```bash
pnpm prisma db seed        # runs prisma/seed.ts directly, migrations untouched
pnpm prisma migrate dev    # applies pending migrations, THEN auto-runs the seed
                            # (every invocation, not just the first — pass
                            # --skip-seed to suppress it for one run)
pnpm prisma migrate reset  # drops the local DB, reapplies every migration,
                            # THEN auto-runs the seed — the fastest "start over"
pnpm prisma studio         # browse what got seeded
```

All three read env vars from your root `.env` (Prisma CLI's own dotenv
loading, not Next.js's) — see the `.env.local` vs. `.env` gotcha in §8's
troubleshooting table if `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
only exist in `.env.local` today.

---

## 5. Step 1 — the platform catalog

Per `plan.md` §7 and `AGENTS.md` §3: "all 8 apps work immediately with zero
setup." That's the platform catalog's job, seeded before anything
household-scoped exists.

### 5.1 Each module owns its own registration

Exactly the shape `docs/project-structure.md` §9 (steps 1–7) already
documents for a hypothetical 9th module — the 8 built-ins use it too, for
real:

```ts
// src/modules/tasks/module.ts
export const moduleRegistration = {
  key: "tasks",
  name: "Tasks",
  description: "Tasks, sub-tasks, tags, and recurring tasks.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: [] as string[],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "tasks",
    key: "task.assigned",
    label: "Task assigned",
    payloadSummary: "{ taskId, assigneeId }",
    contractVersion: 1,
    relatedEntityType: "Task",
  },
  {
    owningModule: "tasks",
    key: "task.completed",
    label: "Task completed",
    payloadSummary: "{ taskId, completedById }",
    contractVersion: 1,
    relatedEntityType: "Task",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "reminders",
    accessLevel: "write",
    purpose: "Remind the assignee before a task's due date.",
    isRequired: true,
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item", label: "Tasks", target: "/tasks", sortOrder: 10 },
  { surface: "quick_capture_target", label: "Add a task", target: "tasks/quick-capture", sortOrder: 10 },
  { surface: "global_search_provider", label: "Tasks", target: "tasks/search", sortOrder: 10 },
];
```

```ts
// src/modules/finance/module.ts
export const moduleRegistration = {
  key: "finance",
  name: "Finance",
  description: "Transactions, budgets, subscriptions, and settlements.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["reminders"],
  status: "active" as const,
};

export const eventTypes = [
  {
    owningModule: "finance",
    key: "bill.due_soon",
    label: "Subscription due soon",
    payloadSummary: "{ subscriptionId, nextDueDate }",
    contractVersion: 1,
    relatedEntityType: "Subscription",
  },
];

export const permissionDeclarations = [
  {
    resourceDomain: "reminders",
    accessLevel: "write",
    purpose: "Alert the responsible member before a Subscription payment or Budget threshold.",
    isRequired: true,
  },
  {
    resourceDomain: "tasks",
    accessLevel: "write",
    purpose: "Create a follow-up task when a subscription payment needs manual confirmation.",
    isRequired: false, // must degrade gracefully without it — plan.md's isRequired contract
  },
];

export const surfaceRegistrations = [
  { surface: "navigation_item", label: "Finance", target: "/finance", sortOrder: 60 },
  { surface: "global_search_provider", label: "Transactions & subscriptions", target: "finance/search", sortOrder: 30 },
];
```

```ts
// src/modules/dashboard/module.ts
export const moduleRegistration = {
  key: "dashboard",
  name: "Dashboard",
  description: "Today view, quick capture, cross-module search, and command palette.",
  version: "1.0.0",
  kind: "built_in" as const,
  dependsOnModules: ["tasks", "calendar", "reminders", "finance"],
  status: "active" as const,
};

// Dashboard is a pure query layer — it owns no entities, so it emits nothing.
export const eventTypes: never[] = [];

export const permissionDeclarations = [
  { resourceDomain: "tasks", accessLevel: "read", purpose: '"Today" view: tasks due.', isRequired: true },
  { resourceDomain: "calendar", accessLevel: "read", purpose: '"Today" view: today\'s events.', isRequired: true },
  { resourceDomain: "finance", accessLevel: "read", purpose: '"Today" view: upcoming bills (7-day lookahead).', isRequired: true },
  { resourceDomain: "reminders", accessLevel: "read", purpose: '"Today" view: active reminders.', isRequired: true },
];

export const surfaceRegistrations = [
  { surface: "navigation_item", label: "Dashboard", target: "/dashboard", sortOrder: 0 },
  { surface: "dashboard_widget", label: "Today", target: "dashboard/widgets/today", sortOrder: 0 },
];
```

The remaining five built-ins follow the exact same shape — full field-for-field
values, so a 9th module's author has every real example to copy instead of
guessing:

| Module (`key`) | `dependsOnModules` | `eventTypes` | `permissionDeclarations` | `surfaceRegistrations` |
|---|---|---|---|---|
| `kanban` | `["tasks"]` | *(none)* | `tasks` / `read_write` / required — "Render and reorder Task rows placed on a board (boardId/columnId/boardPosition)." | `navigation_item` "Kanban" → `/kanban`, sortOrder 20 |
| `calendar` | `["tasks"]` | *(none)* | `tasks` / `read` / required — "Render Task.dueDate rows alongside Event rows in range." | `navigation_item` "Calendar" → `/calendar`, sortOrder 30 |
| `reminders` | `[]` | `reminder.due` — `{ reminderId, occurrenceId, remindAt }`, `relatedEntityType: "ReminderOccurrence"` | `notifications_email` / `write` / required — "Send the reminder email via Resend when an occurrence fires." | `navigation_item` "Reminders" → `/reminders`, sortOrder 40; `quick_capture_target` "Add a reminder" → `reminders/quick-capture`, sortOrder 30 |
| `notes` | `["tasks"]` | *(none)* | `tasks` / `read` / **not** required — "Render a NoteLink chip pointing at a linked Task." | `navigation_item` "Notes" → `/notes`, sortOrder 50; `quick_capture_target` "Add a note" → `notes/quick-capture`, sortOrder 20; `global_search_provider` "Notes" → `notes/search`, sortOrder 20 |
| `life_admin` | `["reminders"]` | *(none — per `ROADMAP.md` §5: "no separate ModuleEventType beyond reminder.due is required for V1")* | `reminders` / `write` / required — "Alert the responsible member before a Renewal or Document expires." | `navigation_item` "Life Admin" → `/life-admin`, sortOrder 70; `global_search_provider` "Documents, renewals & contacts" → `life-admin/search`, sortOrder 40 |

**Folder vs. key, don't conflate them:** the folder is
`src/modules/life-admin/` (kebab-case, matching `docs/project-structure.md`'s
filesystem tree), but the `Module.key` / `ObjectShare.moduleKey` value is
`life_admin` (snake_case) — this exactly matches `docs/access-control.md`
§5.2's `moduleKey` table and `ROADMAP.md`'s "owning module `life_admin`"
wording. They're two different namespaces (filesystem path vs. database
value); a rename of one is not a rename of the other.

**One exception not shown in the table above:** `kanban` also declares one
`eventSubscriptions` entry, reacting to `tasks`' `task.completed` — see §5.4
for why, and for the shape.

**Two more real `ModuleEventType` keys exist: `household.invite_received`
and `share.received`.** `household` isn't one of the 8 `src/modules/`
`Module` rows (`docs/project-structure.md` §1: `Household`/`Member`/
`Invite`/`ObjectShare` are platform substrate, "not one of 'the 8
modules'"), but `ModuleEventType.owningModuleId` is `NOT NULL` — some
`Module` row still has to own these two keys. Resolved as
`src/lib/household/module.ts`: a ninth entry in `ALL_MODULES` (§5.2) with
the same `moduleRegistration`/`eventTypes`/`permissionDeclarations`/
`surfaceRegistrations` shape every real module exports, but living beside
the rest of `household`'s platform code under `src/lib/household/` rather
than under `src/modules/` — it has no page, no nav entry, and nothing
depends on it. `seedPlatformCatalog()` needed zero changes to pick it up,
since it was already generic over `ALL_MODULES`; §11's row count includes
its 2 `ModuleEventType` rows alongside the other 8 modules'.

### 5.2 The registry barrel

```ts
// src/lib/module-registry/registry.ts
// The one file a 9th module's author touches beyond their own
// src/modules/<key>/ folder — everything else in prisma/seed/platform.ts is
// generic over this array. Once a real installer exists (out of scope for
// V1 — plan.md §7), this becomes a DB-driven list instead of a static
// import array; nothing else about seedPlatformCatalog() changes.
import * as household from "@/lib/household/module";
import * as tasks from "@/modules/tasks/module";
import * as kanban from "@/modules/kanban/module";
import * as calendar from "@/modules/calendar/module";
import * as reminders from "@/modules/reminders/module";
import * as notes from "@/modules/notes/module";
import * as finance from "@/modules/finance/module";
import * as lifeAdmin from "@/modules/life-admin/module";
import * as dashboard from "@/modules/dashboard/module";

export const ALL_MODULES = [household, tasks, reminders, kanban, calendar, notes, finance, lifeAdmin, dashboard];
```

### 5.3 `seedPlatformCatalog()`

```ts
// prisma/seed/platform.ts
import { prisma } from "@/lib/db";
import { ALL_MODULES } from "@/lib/module-registry/registry";

export async function seedPlatformCatalog() {
  for (const mod of ALL_MODULES) {
    const module = await prisma.module.upsert({
      where: { key: mod.moduleRegistration.key },
      update: { ...mod.moduleRegistration },
      create: {
        ...mod.moduleRegistration,
        healthStatus: "ok",
        installedAt: new Date(),
        registeredBy: "system-seed", // Module isn't household-scoped — no
                                      // real Member exists yet at this point
                                      // in the seed, so this is free text,
                                      // not a Member FK.
      },
    });

    for (const eventType of mod.eventTypes) {
      await prisma.moduleEventType.upsert({
        where: { key: eventType.key },
        update: {
          label: eventType.label,
          payloadSummary: eventType.payloadSummary,
          relatedEntityType: eventType.relatedEntityType,
        },
        create: eventType,
      });
    }

    for (const decl of mod.permissionDeclarations) {
      // Compound unique key assumed here — flag for docs/orm-conventions.md:
      // add `@@unique([moduleId, resourceDomain, accessLevel])` to
      // ModulePermissionDeclaration when the "Platform — Module & Event
      // Registry" section of prisma/schema.prisma (docs/project-structure.md
      // §5) is written, exactly as this seed script needs it for the
      // upsert below.
      await prisma.modulePermissionDeclaration.upsert({
        where: {
          moduleId_resourceDomain_accessLevel: {
            moduleId: module.id,
            resourceDomain: decl.resourceDomain,
            accessLevel: decl.accessLevel,
          },
        },
        update: { purpose: decl.purpose, isRequired: decl.isRequired },
        create: { moduleId: module.id, ...decl },
      });
    }

    for (const surface of mod.surfaceRegistrations) {
      // Same assumption: `@@unique([moduleId, surface, target])` on
      // ModuleSurfaceRegistration.
      await prisma.moduleSurfaceRegistration.upsert({
        where: {
          moduleId_surface_target: { moduleId: module.id, surface: surface.surface, target: surface.target },
        },
        update: { label: surface.label, sortOrder: surface.sortOrder, enabled: true },
        create: { moduleId: module.id, ...surface, enabled: true },
      });
    }

    for (const sub of mod.eventSubscriptions ?? []) {
      // Only `kanban` declares one of these today (§5.4) — the loop stays
      // generic over every module anyway, so a 9th module's own
      // subscription needs zero changes here, same as every other loop in
      // this function. Looked up (not just keyed by string) because
      // `ALL_MODULES`'s existing ordering (§5.2) already guarantees the
      // owning module's `ModuleEventType` row exists by the time a
      // subscriber's turn in the loop comes.
      const eventType = await prisma.moduleEventType.findUniqueOrThrow({ where: { key: sub.eventTypeKey } });

      // Compound unique key assumed here too — flag for docs/orm-conventions.md:
      // add `@@unique([subscribingModuleId, eventTypeId])` to
      // EventSubscription.
      await prisma.eventSubscription.upsert({
        where: {
          subscribingModuleId_eventTypeId: { subscribingModuleId: module.id, eventTypeId: eventType.id },
        },
        update: { handler: sub.handler, enabled: true },
        create: { subscribingModuleId: module.id, eventTypeId: eventType.id, handler: sub.handler, enabled: true },
      });
    }
  }
}
```

### 5.4 The one `EventSubscription` row: Kanban reacting to `task.completed`

Per `plan.md` §9 Q10 (and `ROADMAP.md`'s Kanban behavior list), the
`Task` ↔ card completion sync runs in *both* directions, and each direction
uses a different mechanism:

- **Card → Task.** Dragging a card into a `done`-typed column completes the
  task: `kanban`'s own `move-card` action calls `tasks`' `completeTask()`
  directly — a normal, permission-checked function call, since `kanban`
  already depends on `tasks` (`dependsOnModules: ["tasks"]`, §5.1).
- **Task → Card.** Completing a task from the plain Tasks list auto-moves
  its card to the board's first `done`-typed column: `tasks` has no
  `dependsOnModules` entry pointing at `kanban` — dependencies only ever run
  `kanban → tasks`, never the reverse — so `completeTask()` has no way to
  call back into Kanban directly. It only emits `task.completed` (§5.1's
  `tasks` `eventTypes`). `kanban` is the one built-in that closes this loop
  itself, by subscribing to that event — the single `EventSubscription` row
  seeded for the 8 built-ins:

```ts
// src/modules/kanban/module.ts (addition alongside §5.1's
// dependsOnModules/permissionDeclarations/surfaceRegistrations)
export const eventSubscriptions = [
  {
    eventTypeKey: "task.completed",
    handler: "kanban/events/onTaskCompleted", // src/modules/kanban/events/subscribers.ts —
                                               // moves the card to the board's first done-typed column
  },
];
```

`prisma/seed/platform.ts` (§5.3) upserts this the same way as everything
else in the platform catalog, keyed off the already-created `Module`/
`ModuleEventType` rows — which is exactly why `tasks` (the owner of
`task.completed`) has to run through the loop before `kanban` does;
`ALL_MODULES`'s existing `[tasks, kanban, ...]` order (§5.2) already
satisfies that.

Every *other* built-in-to-built-in reaction — Finance/Life Admin creating a
`Reminder`, Dashboard's read-only aggregation — really is a direct,
permission-checked function call through the module's public surface (§7 of
`docs/access-control.md`), not a fan-out through `EventSubscription`/
`EventOccurrence`. Kanban's `task.completed` subscription is the single,
structural exception, required by the one-way `dependsOnModules` rule
above — not a stylistic choice, and not a precedent for adding more. A
9th/custom module wanting its own reaction to another module's event
follows this exact shape — its own `eventSubscriptions` array plus a
`src/modules/<key>/events/subscribers.ts` (`docs/project-structure.md` §3) —
Kanban is simply the first one, not a special case. Don't invent a *second*
subscription elsewhere among the 8 built-ins to make the seed feel more
"wired up" than V1 actually is; this is the only one `plan.md`'s Q10
decision requires.

---

## 6. Step 2 — resetting the prior seed run

Household-scoped seed data uses delete-then-recreate (§3), so every seed run
starts by clearing out whatever the last run left behind. Delete children
before parents — don't rely on cascade alone; some household-scoped models
may intentionally use `onDelete: Restrict` once `docs/orm-conventions.md` is
written, so a leftover row should fail loudly here rather than a silent
cascade quietly deleting more than a real household would expect:

```ts
// prisma/seed/reset.ts
import { prisma } from "@/lib/db";
import { SEED_HOUSEHOLD_ID } from "./constants";

export async function resetSeedHousehold() {
  const householdId = SEED_HOUSEHOLD_ID;

  await prisma.$transaction([
    prisma.transactionSplit.deleteMany({ where: { transaction: { householdId } } }),
    prisma.settlement.deleteMany({ where: { householdId } }),
    prisma.transaction.deleteMany({ where: { householdId } }),
    prisma.budget.deleteMany({ where: { householdId } }),
    prisma.subscription.deleteMany({ where: { householdId } }),
    prisma.category.deleteMany({ where: { householdId } }),
    prisma.shoppingListItem.deleteMany({ where: { list: { householdId } } }),
    prisma.shoppingList.deleteMany({ where: { householdId } }),
    prisma.contact.deleteMany({ where: { householdId } }),
    prisma.document.deleteMany({ where: { householdId } }),
    prisma.renewal.deleteMany({ where: { householdId } }),
    prisma.reminderOccurrence.deleteMany({ where: { reminder: { householdId } } }),
    prisma.reminder.deleteMany({ where: { householdId } }),
    prisma.noteLink.deleteMany({ where: { note: { householdId } } }),
    prisma.noteTag.deleteMany({ where: { note: { householdId } } }),
    prisma.note.deleteMany({ where: { householdId } }),
    prisma.event.deleteMany({ where: { householdId } }),
    prisma.taskTag.deleteMany({ where: { task: { householdId } } }),
    prisma.taskRecurrenceRule.deleteMany({ where: { task: { householdId } } }),
    prisma.task.deleteMany({ where: { householdId } }),
    prisma.tag.deleteMany({ where: { householdId } }),
    prisma.kanbanColumn.deleteMany({ where: { board: { householdId } } }),
    prisma.kanbanBoard.deleteMany({ where: { householdId } }),
    prisma.objectShare.deleteMany({ where: { householdId } }),
    prisma.moduleGrant.deleteMany({ where: { householdId } }),
    prisma.notification.deleteMany({ where: { householdId } }),
    prisma.invite.deleteMany({ where: { householdId } }),
    prisma.member.deleteMany({ where: { householdId } }),
    prisma.household.deleteMany({ where: { id: householdId } }),
  ]);
}
```

This intentionally does **not** delete the Supabase Auth users created in §7
— those are recreated-or-reused (`ensureSeedAuthUser`'s lookup-by-email
fallback), never deleted, so re-seeding never invalidates a session you're
still logged in with locally.

---

## 7. Step 3 — Household + Members

```ts
// prisma/seed/constants.ts
export const SEED_HOUSEHOLD_ID = "seed-household-rivera";
export const SEED_MEMBER_OWNER_ID = "seed-member-sam";
export const SEED_MEMBER_ADMIN_ID = "seed-member-priya";
export const SEED_MEMBER_MEMBER_ID = "seed-member-jordan";
export const SEED_DEV_PASSWORD = "devpassword123"; // local dev only — see §7.2's guard
```

```ts
// prisma/seed/household.ts
import { prisma } from "@/lib/db";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  SEED_HOUSEHOLD_ID,
  SEED_MEMBER_OWNER_ID,
  SEED_MEMBER_ADMIN_ID,
  SEED_MEMBER_MEMBER_ID,
  SEED_DEV_PASSWORD,
} from "./constants";

const SEED_MEMBERS = [
  { id: SEED_MEMBER_OWNER_ID, displayName: "Sam Rivera", email: "sam@seed.local", role: "owner" as const, colorTag: "#2563eb" },
  { id: SEED_MEMBER_ADMIN_ID, displayName: "Priya Rivera", email: "priya@seed.local", role: "admin" as const, colorTag: "#16a34a" },
  { id: SEED_MEMBER_MEMBER_ID, displayName: "Jordan Rivera", email: "jordan@seed.local", role: "member" as const, colorTag: "#d97706" },
];

export async function seedHouseholdAndMembers() {
  const household = await prisma.household.create({
    data: {
      id: SEED_HOUSEHOLD_ID,
      name: "The Rivera Household",
      timezone: "America/Denver",
      baseCurrency: "USD",
      status: "active",
    },
  });

  const [owner, admin, member] = await Promise.all(
    SEED_MEMBERS.map(async (m) => {
      const supabaseUserId = await resolveSeedMemberAuthId(m.email);
      return prisma.member.create({
        data: {
          id: m.id,
          householdId: household.id,
          supabaseUserId,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          status: "active",
          colorTag: m.colorTag,
          emailVerifiedAt: new Date(),
          joinedAt: new Date(),
        },
      });
    })
  );

  return { household, owner, admin, member };
}
```

### 7.1 Real logins are opt-in, not automatic

Per plan.md, the household's data-integrity rules and every access-control
check in `docs/access-control.md` key off `Member.id`/`Member.role` alone —
none of the sample data below needs a real Supabase session to exist and be
correct. So by default, seeding **skips** calling Supabase entirely:

```ts
/**
 * Returns a Member's supabaseUserId. Two modes:
 *
 *  - ALLOW_DEV_SEED_AUTH_USERS !== "true" (the default): returns a
 *    placeholder id and makes zero network calls. Every DB-level thing
 *    works (visibility checks, assigneeId/createdById, Prisma Studio
 *    browsing) — you just can't sign in locally as this member.
 *  - ALLOW_DEV_SEED_AUTH_USERS === "true": creates (or reuses, on repeat
 *    runs) a real Supabase Auth user via the admin client, `email_confirm:
 *    true`, so you can actually log in locally with SEED_DEV_PASSWORD —
 *    same admin-client shape docs/auth.md §5 uses for invite acceptance.
 */
async function resolveSeedMemberAuthId(email: string): Promise<string> {
  if (process.env.ALLOW_DEV_SEED_AUTH_USERS !== "true") {
    return `seed-placeholder-${email}`;
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEED_DEV_PASSWORD,
    email_confirm: true,
  });

  if (error) {
    // Already exists from a previous seed run (§6 never deletes auth
    // users) — look it up and reuse its id instead of failing.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list.users.find((u) => u.email === email);
    if (existing) return existing.id;
    throw error;
  }

  return data.user.id;
}
```

### 7.2 Why this is opt-in, and what the guard is actually for

Local dev actually runs a real local Supabase stack via `npx supabase start`
(Docker) — `README.md`'s "Getting Started" §2 has you copy the well-known
local demo `DB_URL`/`API_URL`/keys from `npx supabase status`, not a hosted
project (an earlier draft of this doc assumed hosted-only; corrected here).
That still doesn't make `ALLOW_DEV_SEED_AUTH_USERS=true` safe to flip
casually: whichever `.env` is active is whichever Supabase project/stack
gets real auth accounts created in it, and a staging/preview `.env` copied
locally by mistake would create them there instead of your local stack.
`ALLOW_DEV_SEED_AUTH_USERS=true` is a second, explicit flag you set only in
your local `.env` — never as a Vercel Production/Preview environment
variable, never against a real hosted project — specifically so a
copy-paste mistake doesn't also silently create real auth accounts
somewhere they don't belong. Leave it `false` (the `.env.example` default)
for CI, for sandboxed agent runs, and for anyone who just wants to browse
seeded rows in Prisma Studio.

Verified end-to-end this phase: `pnpm db:seed` with the flag unset creates
placeholder `Member.supabaseUserId` values (DB-only, no network calls);
with it set `true`, all three `@seed.local` accounts get real Supabase Auth
users (confirmed via a direct `POST /auth/v1/token?grant_type=password`
call returning a real access token for `sam@seed.local`); re-running with
the flag still `true` reuses the same `supabaseUserId` rather than erroring
or duplicating (confirmed by comparing ids across two consecutive runs).

---

## 8. Step 4 — pre-granting the household's `ModuleGrant` rows

Reuse `seedModuleGrantsForHousehold()` from `docs/access-control.md` §7.1 —
don't re-implement it here. It already pre-grants every built-in module's
`isRequired: true` declaration and leaves everything else `pending_review`,
exactly per plan.md's "all 8 built-ins work with zero setup" /
"custom modules always require explicit household review" split:

```ts
// prisma/seed.ts (excerpt — see §10 for the full file)
import { seedModuleGrantsForHousehold } from "@/lib/access/module-grants";

await seedModuleGrantsForHousehold(prisma, household.id);
```

Since `seedPlatformCatalog()` (§5.3) has already run by this point, every
`ModulePermissionDeclaration` this call reads already exists — order matters
here specifically because of that dependency (§10 shows the full ordering).

---

## 9. Step 5 — per-module sample data

**Built, verified, and reconciled with reality this phase** — `prisma/seed/*.ts` are the canonical source for the exact shape; this section describes what each seeds and the corrections found along the way, rather than a second inline copy that could drift from the real files again (the fate of an earlier draft of this doc, corrected here — see the specific field-name and gotcha callouts below).

**One cross-cutting gotcha, discovered while building this**: none of the
per-module seed files call `createReminder()` (`@/modules/reminders`) or
`regenerateRenewalReminders()` (`@/modules/life-admin`) even though both are
the real, DRY way the app itself creates `Reminder` rows. `prisma/seed.ts`
runs via plain `tsx`, not Next's bundler — and `createReminder()`'s module
chain transitively imports `src/lib/email/send-category-email.tsx`
(`emitReminderCreated` → `emitEvent` → `dispatchToSubscribers` →
`fanOutNotificationsForOccurrence` → `sendCategoryEmail`), which carries
`import "server-only"`. Confirmed empirically: `tsx`-importing anything
that pulls in `@/modules/reminders` throws `Cannot find module
'server-only'` (the same class of gotcha `docs/toolkit.md` §1 point 3
already documents for `scripts/*.ts`, just reached through a different,
less obvious chain — the reminders module itself is tsx-safe, but its
event-emission side effect isn't). `reminders-notes.ts`, `finance.ts`, and
`life-admin.ts` all hand-roll their `Reminder`/`ReminderOccurrence` rows
directly via `prisma.reminder.create()` instead, mirroring what the real
functions would have written. Same reasoning kept `syncObjectShares()` and
`seedNotificationPreferencesForMember()` out of every seed file — every
seeded entity uses `visibility: "household"` or `"private"` (no
`specific_members` share to sync), and `NotificationPreference`/
`DigestSubscription` are deliberately unseeded anyway (§9.5).

Two real field-name corrections vs. an earlier draft of this doc, worth
calling out since they'd otherwise fail against the actual schema: `Contact`/
`Renewal`/`ShoppingList` all name their creator field `createdById` (not
`createdBy`), and `ShoppingListItem` names its member fields `addedById`/
`checkedById` (not `addedBy`/`checkedBy`). `Task`/`Note`/`TaskTag`/`NoteTag`
nested creates also need `householdId` passed explicitly on the child row
even though it's derivable from the parent — Prisma doesn't infer it, and
the real `create-task.ts`/`create-note.ts` actions already do this.

### 9.1 Tasks, Kanban & Calendar

One `KanbanBoard` (3 columns: `todo`/`in_progress`/`done`, same shape
`create-board.ts`'s `DEFAULT_COLUMNS` uses for a real new board) and 5
`Task`s: board-placed, a one-level sub-task, already-completed-and-sitting-
in-the-Done-column (demonstrating the Task → Card placement without a
running app to trigger it), unplaced (no board/column/position at all —
plan.md allows this), and one more plain task. One `Event`.

**Not seeded: a "recurring" task backed by `TaskRecurrenceRule`.** Grepping
the real `src/modules/tasks/` action files confirms `TaskRecurrenceRule` is
never actually written or read anywhere in the shipped app — the schema
column exists (`Task.recurrenceRuleId`); the feature behind it was never
built (tracked as a known harness gap in `ROADMAP.md`, discovered while
building this seed). Seeding one would fabricate a data shape nothing in
the app can create, display, or manage — the same reasoning §9.5 already
applies to `EventOccurrence`/`NotificationPreference`.

### 9.2 Reminders & Notes

One manual `Reminder` ("Call the plumber about the leak," `sourceType:
"manual"`) with its first `ReminderOccurrence`. Two `Note`s: a standard one
linked to the board task via `NoteLink` (`linkedEntityModule`/
`linkedEntityType`/`linkedEntityId`, plus the matching polymorphic
convenience FK — `linkedTaskId` here, matching what the real `link-note.ts`
action sets), and one private journal entry (`entryDate` set, `title: null`
— the `@@unique([authorMemberId, entryDate])` constraint doesn't collide
since Postgres treats each `NULL` as distinct, but this row sets a real
`entryDate` so it's worth not seeding two journal entries for the same
member/day by accident).

### 9.3 Finance

Reuses the real `seedStarterCategories()` (`@/modules/finance/actions/
seed-starter-categories`, tsx-safe, confirmed empirically) rather than a
second hand-rolled category list — it's the exact function
`signUpAndCreateHousehold()` calls, so the categories a fresh signup gets
and the categories this seed's household gets are always the same list, by
construction. `createMany()` doesn't return the created rows, so this seed
fetches them back by `householdId` afterward to look up `Groceries`/
`Utilities` by name.

One `Subscription` ("Internet service," monthly, due soon) with a
hand-rolled `Reminder` (`sourceType: "subscription"`) simulating what
`sweep-subscription-due-dates.ts` would have created once the subscription
entered its alert window — the cross-module link `docs/seeding.md`'s intro
promises ("a Subscription linked to a Reminder"). One `Transaction` (equal
split between the payer and one other member) plus a `Settlement` that
clears the other member's half — `TransactionSplit.settled` is set
directly here for brevity, bypassing the real `settleTransactionSplits()`-
equivalent logic; never do that outside a seed script. One whole-household
`Budget` (`memberId: null` — an exceeded-threshold alert would notify every
active member, plan.md §9 Q25).

### 9.4 Life Admin

One `Renewal` ("Car registration," `reminderOffsetsDays: [30, 7]`) with one
hand-rolled `Reminder` per offset — what `regenerateRenewalReminders()`
would have created at real `Renewal` creation time (see the cross-cutting
gotcha above for why this seed doesn't call that function directly). One
`Contact`. One `ShoppingList` with 3 items, one already checked (checking
an item never auto-creates a Finance `Transaction` per plan.md — this seed
doesn't perform that separate, explicit step either).

### 9.5 Deliberately not seeded

- **`NotificationPreference` / `DigestSubscription`** — both are per-member,
  per-`categoryKey` (or 1:1) rows meant to be created lazily (defaulted
  `true`/`off` on first read, or at real signup) rather than fabricated
  wholesale here; seeding them would just be re-deriving what the app
  already defaults, module by module, for no behavioral difference.
- **`EventOccurrence`** — a runtime audit log of events that actually fired.
  Real usage produces these; hand-writing fake ones would misrepresent what
  actually happened, which defeats the point of an audit trail.
- **`Invite`** — not in the requested seed scope; every seeded `Member` is
  already `active`, so there's no pending invite to demonstrate without
  inventing a fourth, not-yet-real person.
- **`Document`** — every real `Document` row points at a Supabase Storage
  object (`fileRef`, `docs/upload.md`); fabricating a row with no real
  uploaded file behind it would produce a broken download link the moment
  anyone actually clicked it in the seeded UI.
- **`TaskRecurrenceRule`** — see §9.1's note: not used by any real,
  shipped Tasks code today, so there's nothing to demonstrate yet.

---

## 10. `prisma/seed.ts` — the entrypoint

```ts
// prisma/seed.ts
import { prisma } from "@/lib/db";
import { seedModuleGrantsForHousehold } from "@/lib/access/module-grants";
import { seedPlatformCatalog } from "./seed/platform";
import { resetSeedHousehold } from "./seed/reset";
import { seedHouseholdAndMembers } from "./seed/household";
import { seedTasksKanbanCalendar } from "./seed/tasks-kanban-calendar";
import { seedRemindersAndNotes } from "./seed/reminders-notes";
import { seedFinance } from "./seed/finance";
import { seedLifeAdmin } from "./seed/life-admin";
import { SEED_DEV_PASSWORD } from "./seed/constants";

async function main() {
  console.log("→ Platform catalog (Module / EventType / PermissionDeclaration / SurfaceRegistration)…");
  await seedPlatformCatalog();

  console.log("→ Resetting the seed household from any prior run…");
  await resetSeedHousehold();

  console.log("→ Household + 3 Members (owner/admin/member)…");
  const { household, owner, admin, member } = await seedHouseholdAndMembers();

  console.log("→ Pre-granting built-in modules' required ModuleGrant rows…");
  await seedModuleGrantsForHousehold(prisma, household.id);

  console.log("→ Tasks, Kanban, Calendar…");
  const { tasks } = await seedTasksKanbanCalendar(household, { owner, admin, member });

  console.log("→ Reminders + Notes…");
  await seedRemindersAndNotes(household, { owner, admin, member }, tasks);

  console.log("→ Finance…");
  await seedFinance(household, { owner, admin, member });

  console.log("→ Life Admin…");
  await seedLifeAdmin(household, { owner, admin, member });

  console.log(`
Seed complete — "The Rivera Household".
${
  process.env.ALLOW_DEV_SEED_AUTH_USERS === "true"
    ? `Log in locally as:
  owner  → sam@seed.local    / ${SEED_DEV_PASSWORD}
  admin  → priya@seed.local  / ${SEED_DEV_PASSWORD}
  member → jordan@seed.local / ${SEED_DEV_PASSWORD}`
    : "ALLOW_DEV_SEED_AUTH_USERS is not \"true\" — Member rows exist but can't sign in. See docs/seeding.md §7.2."
}
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

The ordering above is load-bearing, not stylistic:

1. **Platform catalog first** — `ModuleGrant` seeding (step 4) reads
   `ModulePermissionDeclaration` rows that must already exist.
2. **Reset, then Household + Members** — everything else FKs to
   `household.id`/`owner.id`/`admin.id`/`member.id`.
3. **`ModuleGrant`s before any domain data** — not strictly required by FK,
   but matches the real app's invariant that a household's grants exist from
   the moment the household does (`docs/access-control.md` §7.1's
   `createHousehold()` runs both in the same transaction; this seed mirrors
   that ordering even though it isn't one transaction here).
4. **Tasks/Kanban/Calendar before Reminders/Notes** — `seedRemindersAndNotes`
   takes `tasks.boardTask` to create a real `NoteLink`.
5. **Finance and Life Admin last** — independent of each other, but each
   creates its own `Reminder` rows referencing entities (`Subscription`,
   `Renewal`) that must already exist.

---

## 11. What you get

| Module | Rows seeded |
|---|---|
| Platform (not household-scoped) | 9 `Module` (the 8 built-ins + `household`, §5.1), 28 `ModuleEventType`, 14 `ModulePermissionDeclaration`, 24 `ModuleSurfaceRegistration`, 1 `EventSubscription` — verified by direct count against the real seeded database, not estimated |
| Household & Sharing | 1 `Household`, 3 `Member` (owner/admin/member), 14 `ModuleGrant` (pre-granted, one per required declaration) |
| Tasks, Kanban & Calendar | 2 `Tag`, 1 `KanbanBoard` + 3 `KanbanColumn`, 5 `Task` (board-placed, sub-task, completed-in-done-column, unplaced, one plain) + 2 `TaskTag`, 1 `Event` — no `TaskRecurrenceRule` (§9.1/§9.5) |
| Reminders & Notes | 1 `Reminder` (manual) + its occurrence, 2 `Note` (standard + journal), 1 `NoteLink` |
| Finance | 8 `Category` (the real `STARTER_CATEGORIES` list), 1 `Subscription` (+1 `Reminder`), 1 `Transaction` + 2 `TransactionSplit`, 1 `Settlement`, 1 `Budget` |
| Life Admin | 1 `Renewal` (+2 `Reminder`, one per `reminderOffsetsDays` entry), 1 `Contact`, 1 `ShoppingList` + 3 `ShoppingListItem` |

Total across Reminders/Finance/Life Admin: 4 `Reminder` rows + 4
`ReminderOccurrence` rows (one each, all `pending`) — also verified by
direct count, along with every cross-module link (`NoteLink.linkedEntityId`
matches the seeded board `Task.id`; the subscription-sourced
`Reminder.sourceEntityId` matches the seeded `Subscription.id`).

`ModuleEventType`'s count of 28 spans every real event key across all 8
built-ins (`tasks`: `task.assigned`/`task.completed`; `finance`:
`bill.due_soon`/`transaction.recorded`/`budget.threshold_exceeded`/
`settlement.recorded`; `reminders`: `reminder.due` + the 4
create/snooze/complete/cancel lifecycle events; `life_admin`: 10, including
`renewal.expiring_soon`/`renewal.expired`; `notes`/`calendar`'s own few),
plus `household.invite_received`/`share.received` from the `household`
pseudo-module (§5.1).

---

## 12. Verifying the seed worked

```bash
pnpm prisma studio
```

Opens a GUI on the local DB — check `Household` has exactly one row named
"The Rivera Household," `Member` has 3 rows with three different `role`
values, and spot-check a cross-module link: `Reminder.sourceEntityId` on the
`subscription`-sourced row should match the seeded `Subscription.id`; the
`NoteLink` row's `linkedEntityId` should match the seeded board `Task.id`.

If you enabled `ALLOW_DEV_SEED_AUTH_USERS=true`, confirm the Supabase Auth
side too — Supabase Dashboard → Authentication → Users should list all three
`@seed.local` addresses, `email_confirm`ed, and `pnpm dev` → log in as
`sam@seed.local` should land on `/dashboard` as the `owner`.

---

## 13. Extending the seed for a 9th module

Following on from `docs/project-structure.md` §9's registration checklist
for a new module:

1. Write `src/modules/<key>/module.ts` (§5.1's shape) as part of
   building the module — nothing new here beyond what
   `docs/project-structure.md` already documents.
2. Add one import + one array entry to
   `src/lib/module-registry/registry.ts` (§5.2). `prisma/seed/platform.ts`
   needs **zero** changes — it's already generic over `ALL_MODULES`.
3. If the module owns genuinely new entities worth demoing, add
   `prisma/seed/<key>.ts` (following §9's per-module file shape) and one
   `console.log` + one function call to `prisma/seed.ts`, in whatever
   position its FK dependencies require (§10's ordering rules).
4. If it reuses existing entities only (the common case per `AGENTS.md` §2
   Step 0's reuse table — e.g. it only creates `Reminder`s and
   `ShoppingListItem`s), it may not need its own seed file at all.

---

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Unique constraint failed on the fields: (key)` on `Module`/`ModuleEventType` | Something in `prisma/seed/platform.ts` used `create`/`createMany` instead of `upsert` | Always upsert platform-catalog rows by their natural key (§3) |
| Re-running the seed doubles up `Task`/`Note`/etc. rows | `resetSeedHousehold()` wasn't called, or was called with the wrong id | Confirm `SEED_HOUSEHOLD_ID` in `prisma/seed/constants.ts` matches what `resetSeedHousehold()` deletes by |
| Seed throws `Error: fetch failed` / Supabase auth errors | `ALLOW_DEV_SEED_AUTH_USERS=true` but `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are missing | Prisma's CLI (and therefore `prisma db seed`) only auto-loads the root `.env` — not `.env.local`. If those vars only exist in `.env.local` (as `docs/auth.md` §2.2 shows them), mirror them into root `.env` too |
| Logged in locally as `sam@seed.local` but see no data | Ran `pnpm prisma db seed` with `ALLOW_DEV_SEED_AUTH_USERS=false` first (placeholder `supabaseUserId`), then flipped it `true` and re-ran — the new Supabase Auth user's real id doesn't match the placeholder already stored on the `Member` row | `resetSeedHousehold()` + reseed after flipping the flag — the `Member` row gets recreated with the real `supabaseUserId` this time |
| `prisma migrate reset` seems to hang | `ALLOW_DEV_SEED_AUTH_USERS=true` and Supabase's API is slow/unreachable | Expected — it's making real network calls. Set the flag back to `false` for a fast DB-only reset loop while iterating on unrelated schema changes |

---

## Appendix: file map

| File | Purpose |
|---|---|
| `prisma/seed.ts` | Entrypoint — orchestrates every step below, in dependency order |
| `prisma/seed/constants.ts` | Fixed seed IDs (`SEED_HOUSEHOLD_ID`, member IDs) + dev password |
| `prisma/seed/platform.ts` | `seedPlatformCatalog()` — upserts `Module`/`ModuleEventType`/`ModulePermissionDeclaration`/`ModuleSurfaceRegistration`/`EventSubscription` from `src/lib/module-registry/registry.ts` |
| `prisma/seed/reset.ts` | `resetSeedHousehold()` — deletes the fixed household's rows before recreating them |
| `prisma/seed/household.ts` | `seedHouseholdAndMembers()` — `Household` + 3 `Member`s (+ optional Supabase Auth users) |
| `prisma/seed/tasks-kanban-calendar.ts` | `Tag`, `KanbanBoard`/`KanbanColumn`, `Task`(s) + `TaskRecurrenceRule` + `TaskTag`, `Event` |
| `prisma/seed/reminders-notes.ts` | `Reminder` (+ `ReminderOccurrence`), `Note`(s), `NoteLink` |
| `prisma/seed/finance.ts` | `Category`, `Subscription`, `Transaction` + `TransactionSplit`, `Settlement`, `Budget` |
| `prisma/seed/life-admin.ts` | `Renewal` (+ `Reminder`), `Contact`, `ShoppingList` + `ShoppingListItem` |
| `src/lib/module-registry/registry.ts` | Barrel of every module's `module.ts` — the one file a 9th module's author appends to |
| `src/modules/<key>/module.ts` | Each built-in's own `moduleRegistration`/`eventTypes`/`permissionDeclarations`/`surfaceRegistrations` exports (`kanban`'s also exports `eventSubscriptions`, §5.4) |

## Do / Don't

| Do | Don't |
|---|---|
| Upsert platform-catalog rows by their natural unique key (`Module.key`, `ModuleEventType.key`, the `ModulePermissionDeclaration`/`ModuleSurfaceRegistration` compound keys) | Recreate the whole catalog with a blind `createMany` — duplicates every re-run |
| Delete-then-recreate household sample data, scoped to the fixed `SEED_HOUSEHOLD_ID` | Let household sample data accumulate duplicate rows across repeated `pnpm prisma db seed` runs |
| Reuse `seedModuleGrantsForHousehold()` from `docs/access-control.md` §7.1 | Hand-roll a second copy of grant-seeding logic inside `prisma/seed/` |
| Gate real Supabase Auth account creation behind `ALLOW_DEV_SEED_AUTH_USERS=true` | Let a plain `pnpm prisma db seed` silently create auth accounts against whatever `.env` happens to be active |
| Add a 9th module's registration to `src/lib/module-registry/registry.ts` and nothing else | Add a 9th module's rows directly inside `prisma/seed/platform.ts` |
| Seed at least one Reminder/Note/etc. that crosses a module boundary (`sourceModule`, `NoteLink`) so the seed demonstrates connection, not just per-module isolation | Seed every module's data in total isolation from the others — that doesn't exercise anything `docs/access-control.md` §7 or `AGENTS.md` §3 actually cares about |
