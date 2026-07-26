# Module Architecture

The concrete technical implementation of Home OS's platform/extensibility
layer: `Module`, `ModuleEventType`, `EventSubscription`, `EventOccurrence`,
`ModulePermissionDeclaration`, `ModuleGrant`, `ModuleSurfaceRegistration`, and
the event bus (`emitEvent()`/`dispatchToSubscribers()`) that connects them.
This is the "how" behind `plan.md` §3.6/§7's "what" and `AGENTS.md` §2's
step-by-step 9th-module checklist — read this doc when you need to know
*exactly* which row gets written where, in what order, and what code reads
it back.

Companion docs, each owning a different angle of the same system:
- `docs/project-structure.md` — *where the code for this system lives*
  (`src/lib/module-registry/`, `src/lib/events/`, each module's `module.ts`)
  and the folder shape every module follows. This doc assumes that layout.
- `docs/seeding.md` §5 — the actual seed script that upserts every built-in
  module's catalog rows, including §5.4's one real `EventSubscription`
  (Kanban reacting to `task.completed`) worked through in full.
- `docs/orm-conventions.md` — Prisma-level naming/scoping rules (this doc's
  Prisma excerpts follow those rules but the full field-by-field schema is
  that doc's job, not this one's).
- `docs/access-control.md` — role/visibility enforcement layered on top of
  `ModuleGrant` (§7 of that doc); this doc owns the *shape and lifecycle* of
  `ModuleGrant` itself, that doc owns *who's allowed to flip it*.
- `AGENTS.md` §2 — the operational checklist (commands to run, files to
  touch) for adding a 9th module. This doc explains *why* that checklist
  produces exactly those rows, in exactly that order.

> **Harness naming notes.** A handful of implementation names vary slightly
> across already-written docs. This file picks one option and uses it
> consistently throughout everything below; reconcile the others the next
> time they're touched, following the same "known harness inconsistency"
> convention `docs/orm-conventions.md` and `docs/access-control.md` already
> use elsewhere:
> - **Manifest file name: `src/modules/<key>/module.ts`** — matches
>   `AGENTS.md` and `docs/project-structure.md`'s own folder tree/anatomy
>   table (its authoritative statement of where files live, which this doc
>   was written to be consistent with). `docs/seeding.md` and
>   `docs/resources.md` currently write the same file as `module.manifest.ts`.
> - **Manifest shape: one file, several named const exports**
>   (`moduleRegistration`, `eventTypes`, `permissionDeclarations`,
>   `surfaceRegistrations`, `eventSubscriptions`) — matches `AGENTS.md`'s
>   worked example and, more importantly, matches `docs/seeding.md` §5.3's
>   actual `seedPlatformCatalog()` script, which iterates exactly
>   `mod.moduleRegistration` / `mod.eventTypes` / `mod.permissionDeclarations`
>   / `mod.surfaceRegistrations` / `mod.eventSubscriptions ?? []` — code this
>   doc's own registry/dispatch examples need to interoperate with, not just
>   read similarly to. `docs/project-structure.md` §9's sample and
>   `docs/resources.md` instead show one nested `<key>Manifest` object;
>   functionally equivalent, just a different literal shape.
> - **Grant-check function: `hasModuleGrant()`** — matches
>   `docs/access-control.md`'s fully worked implementation.
>   `docs/project-structure.md` names the same concept `checkModuleGrant()`.
> - **Prisma client import: `@/lib/db`** — matches
>   `docs/project-structure.md`, `AGENTS.md`, and `docs/seeding.md`.
>   `docs/orm-conventions.md` proposes `@/lib/db` instead; not adopted here
>   since three of four sibling docs already commit to `@/lib/db`.

---

## 1. The rule this whole system exists to enforce

> A module — one of the 8 built-ins or a 9th/custom one — is a set of rows in
> platform registries, never bespoke wiring into another module's code.
> (`CLAUDE.md` rule 3)

Concretely: nothing in `src/modules/dashboard/`, `src/components/app-shell/`,
or any other module's `actions/`/`queries/` file is ever allowed to contain
`if (moduleKey === "tasks")` or `switch (module.key)`. Every cross-module
interaction goes through exactly one of three sanctioned paths:

1. **A direct barrel import** (`import { completeTask } from "@/modules/tasks"`)
   — for a structural, declared dependency (`dependsOnModules`), used
   synchronously (§7).
2. **`emitEvent()` + a subscribed reaction** — for a genuinely optional,
   decoupled reaction, where the emitting module doesn't know or care who's
   listening (§4–§6).
3. **A `ModuleSurfaceRegistration` row** — for "show up somewhere in the
   shared UI," resolved generically by the surface itself, never hand-added
   per module (§9).

Everything below is the concrete mechanics of paths 2 and 3, plus the
platform-catalog (`Module`) and grant (`ModuleGrant`) bookkeeping that gates
path 1 too.

---

## 2. The seven pieces, at a glance

| Entity | Scope | Owning file(s) | One-line job |
|---|---|---|---|
| `Module` | **global** (platform catalog) | `src/lib/module-registry/registry.ts` (barrel), `prisma/seed.ts` (upsert) | The installed-apps catalog: identity, health, soft-dependency graph |
| `ModuleEventType` | **global** | `src/modules/<key>/module.ts` (`eventTypes`) | A module's declared, versioned "notable moment" contract |
| `EventSubscription` | **global** | `src/modules/<key>/module.ts` (`eventSubscriptions`), `src/lib/events/handlers.ts` (runtime map) | One module's registration to react to another's event |
| `EventOccurrence` | household-scoped | `src/lib/events/emit.ts` | Audit record that an event actually fired, for one household |
| `ModulePermissionDeclaration` | **global** | `src/modules/<key>/module.ts` (`permissionDeclarations`) | A module's manifest of what it needs and whether it's required |
| `ModuleGrant` | household-scoped | `src/lib/module-registry/permissions.ts` | What one household has actually approved for a module |
| `ModuleSurfaceRegistration` | **global** | `src/modules/<key>/module.ts` (`surfaceRegistrations`), `src/lib/module-registry/surfaces.ts` (runtime map) | Where a module plugs into shared UI (nav/dashboard/search/palette/quick-capture/notification settings) |

"Global" here means exactly what `CLAUDE.md` rule 1 calls out: these five
models (`Module`, `ModuleEventType`, `EventSubscription`,
`ModulePermissionDeclaration`, `ModuleSurfaceRegistration`) are the only
Prisma models in the whole schema with **no** `householdId` column — they
describe the platform's installed capabilities, not any one household's data.
`EventOccurrence` and `ModuleGrant` *are* household-scoped (a fact that
happened at/for a specific household), so both carry `householdId` and both
follow the ordinary tenant-scoping rule from `docs/orm-conventions.md` §3.

---

## 3. `Module` — the catalog and its derived health

```prisma
// prisma/schema.prisma — Platform & Extensibility section
// (see docs/orm-conventions.md §1.1 for banner placement)
model Module {
  id           String       @id @default(cuid())
  key          String       @unique // e.g. "tasks", "kanban", "life_admin" — snake_case, immutable
  name         String
  description  String?
  version      String       // semver-style; bump on any breaking contract change — see §12
  kind         ModuleKind   // built_in | custom
  status       ModuleStatus @default(active)     // active | disabled | error — platform-wide
  healthStatus ModuleHealth @default(ok)          // ok | degraded | missing_dependency — derived, see §3.1
  installedAt  DateTime     @default(now())
  registeredBy String?      // Member id, or "system-seed" for the 8 built-ins — free text, no FK
                             // (no real Member exists yet when the platform catalog is first seeded)

  dependsOn    Module[] @relation("ModuleDependsOn") // soft dependencies
  dependents   Module[] @relation("ModuleDependsOn")

  eventTypes             ModuleEventType[]
  permissionDeclarations ModulePermissionDeclaration[]
  surfaceRegistrations   ModuleSurfaceRegistration[]
  subscriptions          EventSubscription[] // this module as subscriber
  grants                 ModuleGrant[]

  @@index([status])
}

enum ModuleKind   { built_in custom }
enum ModuleStatus { active disabled error }
enum ModuleHealth { ok degraded missing_dependency }
```

`kind` is set once at registration and never changes: the 8 original modules
are `built_in`; every module added after them, including a 9th, is `custom` —
this is the one field the whole `ModuleGrant` pre-seed/`pending_review` split
(§8) keys off.

### 3.1 `healthStatus` is derived, never hand-set

`healthStatus` reflects the soft `dependsOn` graph, recomputed whenever a
`Module.status` changes — never computed lazily on every page render (that
would mean walking the dependency graph on every request that touches a
module's data):

```ts
// src/lib/module-registry/health.ts
import { prisma } from "@/lib/db";
import type { ModuleHealth } from "@prisma/client";

/**
 * Recomputes `healthStatus` for every module that directly depends on
 * `changedModuleKey`, after that module's own `status` changes. Call this
 * from the one place `Module.status` is ever written — there's no
 * end-user-facing toggle for it in V1 (plan.md §7: a developer/agent flips
 * this in code, e.g. via `prisma studio` or a maintenance script).
 */
export async function recomputeDependentHealth(changedModuleKey: string) {
  const dependents = await prisma.module.findMany({
    where: { dependsOn: { some: { key: changedModuleKey } } },
    include: { dependsOn: true, permissionDeclarations: true },
  });

  for (const dependent of dependents) {
    const brokenDeps = dependent.dependsOn.filter((dep) => dep.status !== "active");

    let healthStatus: ModuleHealth = "ok";
    if (brokenDeps.length > 0) {
      // A broken dependency this module has an `isRequired: true`
      // ModulePermissionDeclaration against (resourceDomain === dep.key, the
      // common case for a module-to-module soft dependency) is load-bearing;
      // anything only optionally depended on merely degrades the module.
      const anyRequired = brokenDeps.some((dep) =>
        dependent.permissionDeclarations.some(
          (decl) => decl.resourceDomain === dep.key && decl.isRequired,
        ),
      );
      healthStatus = anyRequired ? "missing_dependency" : "degraded";
    }

    await prisma.module.update({ where: { id: dependent.id }, data: { healthStatus } });
  }
}
```

`resourceDomain` values that aren't module keys (`members_household`,
`notifications_email`, `cross_module_events`) never match a `dependsOn` entry
and are simply skipped by the `.some(...)` check above — this function only
ever asserts something about *inter-module* dependencies, not the platform
substrate every module implicitly relies on.

**Worked example.** `finance`'s manifest declares `dependsOnModules:
["reminders"]`. If `reminders`' own `Module.status` is ever flipped to
`disabled` (a developer/maintenance action, never a household action),
`recomputeDependentHealth("reminders")` finds `finance` as a dependent, sees
`reminders` isn't `active`, checks whether `finance`'s own
`ModulePermissionDeclaration` for `resourceDomain: "reminders"` has
`isRequired: true` (it does — "Alert the responsible member before a
Subscription payment or Budget threshold," per `docs/seeding.md` §5.1) — so
`finance.healthStatus` becomes `missing_dependency`, not merely `degraded`.
Every place Finance would create a `Reminder` must check this before acting
(§10).

---

## 4. `ModuleEventType` — announcing a notable moment

```prisma
model ModuleEventType {
  id              String   @id @default(cuid())
  moduleId        String
  owningModule    Module   @relation(fields: [moduleId], references: [id])
  key             String   @unique // dot-namespaced: "<module_key>.<event_name>", e.g. "task.completed"
  label           String
  payloadSummary  String   // conceptual description of included fields — the promise subscribers code against
  contractVersion Int      @default(1) // bumped only on a breaking change — see §12
  relatedEntityType String?
}
```

A module declares its event types as a plain array in its own `module.ts` —
this is data any 9th module writes exactly the same way the 8 built-ins
already do (`docs/seeding.md` §5.1):

```ts
// src/modules/tasks/module.ts (excerpt)
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
```

### 4.1 Emitting one — `emitEvent()`

Every module's Server Action that reaches a notable moment calls the one
shared function — never writes to `EventOccurrence` directly, and never
invokes a subscriber's handler itself:

```ts
// src/lib/events/emit.ts
import { prisma } from "@/lib/db";
import { dispatchToSubscribers } from "./dispatch";

export async function emitEvent(
  householdId: string,
  eventTypeKey: string, // e.g. "task.completed" — always <module_key>.<event_name>
  payload: Record<string, unknown>,
  triggeredByMemberId: string | null, // null for a system/time-based trigger, e.g. a cron sweep
) {
  const eventType = await prisma.moduleEventType.findUniqueOrThrow({ where: { key: eventTypeKey } });

  const occurrence = await prisma.eventOccurrence.create({
    data: {
      householdId,
      eventTypeId: eventType.id,
      emittedByModule: eventType.owningModule,
      occurredAt: new Date(),
      triggeredByMemberId,
      payloadSnapshot: payload, // Prisma `Json` column — matches eventType.payloadSummary's shape
      subscriptionsNotified: 0, // updated in place once dispatch finishes, see §6
    },
    include: { eventType: true },
  });

  await dispatchToSubscribers(occurrence);
  return occurrence;
}
```

Each module wraps this in its own typed helper so call sites get compile-time
payload safety even though the DB column itself is untyped `Json` — this is
the pattern already established for `tasks` and reused identically by every
other module (`docs/project-structure.md` §3.2, `docs/resources.md` §2.5):

```ts
// src/modules/tasks/events/emitters.ts
import { emitEvent } from "@/lib/events/emit";

export async function emitTaskCompleted(
  householdId: string,
  taskId: string,
  completedById: string,
) {
  return emitEvent(householdId, "task.completed", { taskId, completedById }, completedById);
}
```

```ts
// src/modules/tasks/actions/complete-task.ts
"use server";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { emitTaskCompleted } from "../events/emitters";

export async function completeTask(taskId: string) {
  const { member, household } = await requireMember();

  const task = await prisma.task.update({
    where: { id: taskId, householdId: household.id }, // both, always — CLAUDE.md rule 1
    data: { completedAt: new Date(), completedById: member.id },
  });

  await emitTaskCompleted(household.id, task.id, member.id);
  return task;
}
```

`emitEvent` runs synchronously, inline with the action — there is no message
queue in V1 (consistent with "no websockets/real-time push," `plan.md` §9
Q-platform-wide). If the Server Action's own transaction rolls back after
this call, the `EventOccurrence` row (and anything it triggered) is **not**
rolled back with it unless `emitEvent` is called inside the same
`prisma.$transaction` — call it last, after the primary write succeeds, for
exactly that reason.

---

## 5. `EventOccurrence` — the audit trail

```prisma
model EventOccurrence {
  id                    String          @id @default(cuid())
  householdId           String
  household             Household       @relation(fields: [householdId], references: [id])
  eventTypeId           String
  eventType             ModuleEventType @relation(fields: [eventTypeId], references: [id])
  emittedByModule        String         // denormalized copy of eventType.owningModule's key
  occurredAt            DateTime        @default(now())
  triggeredByMemberId    String?
  triggeredByMember      Member?         @relation(fields: [triggeredByMemberId], references: [id])
  payloadSnapshot        Json
  subscriptionsNotified  Int             @default(0)

  @@index([householdId, eventTypeId])
}
```

Every event that fires — whether anything subscribed to it or not — gets one
`EventOccurrence` row. This is what backs "why didn't X happen" debugging
(`plan.md` §7) and reliable notification delivery: the platform's own
`Notification` fan-out (`docs/email.md`) reads
`EventOccurrence` rows for the `categoryKey`s it cares about, independent of
any `EventSubscription`.

```ts
// modules/platform/queries/get-recent-occurrences.ts — a debugging/support query
export async function getRecentOccurrences(householdId: string, eventTypeKey?: string) {
  return prisma.eventOccurrence.findMany({
    where: { householdId, ...(eventTypeKey ? { eventType: { key: eventTypeKey } } : {}) },
    orderBy: { occurredAt: "desc" },
    take: 50,
    include: { eventType: true, triggeredByMember: true },
  });
}
```

`EventOccurrence` retention is "short/rolling" per `plan.md` §3.6 — this is
an operational table, not a permanent product feature; a scheduled cleanup
job trimming old rows is expected but not specified further here.

---

## 6. `EventSubscription` — reacting to another module's event

```prisma
model EventSubscription {
  id                      String          @id @default(cuid())
  subscriberModuleId      String
  subscriberModule        Module          @relation(fields: [subscriberModuleId], references: [id])
  eventTypeId             String
  eventType               ModuleEventType @relation(fields: [eventTypeId], references: [id])
  reactionDescription     String          // plain-English description of what happens — shown in any future admin/debug UI
  active                  Boolean         @default(true)
  onFailure               EventFailureMode @default(log_only) // ignore | log_only | disable_after_n_failures
  consecutiveFailureCount Int             @default(0)
  lastTriggeredAt         DateTime?
  lastError               String?

  @@unique([subscriberModuleId, eventTypeId])
}

enum EventFailureMode { ignore log_only disable_after_n_failures }
```

`reactionDescription` is documentation, not a callable — Postgres can't store
a function pointer, and a bare string column certainly isn't one either. A
module declares the *registration* (this row) in its own `module.ts`:

```ts
// src/modules/kanban/module.ts (excerpt — see §7 for why Kanban is the one
// built-in that needs this instead of a direct call)
import { onTaskCompleted } from "./events/subscribers";

export const eventSubscriptions = [
  {
    subscriberModule: "kanban",
    eventType: "task.completed",
    reactionDescription:
      "Move the task's card to its board's first done-typed column when the " +
      "task is completed from the plain task list (not by dragging the card itself).",
    onFailure: "log_only" as const,
  },
];

// Exported separately from the array above — the DB row is an audit/config
// record; the actual function it names lives in code and is wired into the
// runtime dispatch map below, not stored in Postgres.
export { onTaskCompleted };
```

```ts
// src/modules/kanban/events/subscribers.ts
import { prisma } from "@/lib/db";

export async function onTaskCompleted(
  payload: { taskId: string; completedById: string },
  householdId: string,
) {
  const task = await prisma.task.findFirst({ where: { id: payload.taskId, householdId } });
  if (!task?.boardId) return; // task isn't on any board — nothing to move, not an error

  const doneColumn = await prisma.kanbanColumn.findFirst({
    where: { boardId: task.boardId, columnType: "done" },
    orderBy: { position: "asc" }, // "first done-typed column" — plan.md §9 Q10
  });
  if (!doneColumn) return; // board has no done-typed column — degrade silently, per plan.md §9 Q10

  await prisma.task.update({ where: { id: task.id, householdId }, data: { columnId: doneColumn.id } });
}
```

### 6.1 The runtime dispatch map — the same problem `ModuleSurfaceRegistration.target` has, solved the same way

Next.js can't `import()` a component or function from a runtime database
string in a serverless deployment (`docs/project-structure.md` §4.3 already
establishes this for `surfaces.ts`). `EventSubscription` has the identical
shape of problem — a DB row names a reaction, but the reaction is a real TS
function — solved with the identical fix: a small static compile-time map:

```ts
// src/lib/events/handlers.ts
import { onTaskCompleted } from "@/modules/kanban/events/subscribers";

type EventHandler = (payload: unknown, householdId: string) => Promise<void>;

/**
 * Keyed by `${subscriberModule.key}:${eventType.key}`. This is the ONE other
 * place (besides src/lib/module-registry/surfaces.ts) a module's declarative
 * registration data needs a matching compiled entry — every subscription
 * gets exactly one line here, none of them behind an `if`.
 */
export const eventHandlers: Record<string, EventHandler> = {
  "kanban:task.completed": onTaskCompleted as EventHandler,
};
```

### 6.2 `dispatchToSubscribers()` and the `onFailure` contract

```ts
// src/lib/events/dispatch.ts
import { prisma } from "@/lib/db";
import { eventHandlers } from "./handlers";
import { fanOutNotificationsForOccurrence } from "@/lib/notifications/dispatch";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

const MAX_CONSECUTIVE_FAILURES = 5; // fixed platform-wide constant, not per-subscription configurable in V1

export async function dispatchToSubscribers(
  occurrence: EventOccurrence & { eventType: ModuleEventType },
) {
  // Baseline platform behavior — every occurrence gets the Notification/email
  // fan-out for its categoryKey for free, gated only by NotificationPreference
  // (docs/email.md). This is NOT an EventSubscription and
  // no module opts into it by registering one (docs/seeding.md §5.4's framing).
  await fanOutNotificationsForOccurrence(occurrence);

  const subscriptions = await prisma.eventSubscription.findMany({
    where: { eventTypeId: occurrence.eventTypeId, active: true },
    include: { subscriberModule: true },
  });

  let notified = 0;

  for (const sub of subscriptions) {
    const handler = eventHandlers[`${sub.subscriberModule.key}:${occurrence.eventType.key}`];
    if (!handler) continue; // registered in the DB but no compiled handler wired — no-op, never throws

    try {
      await handler(occurrence.payloadSnapshot, occurrence.householdId);
      notified += 1;
      await prisma.eventSubscription.update({
        where: { id: sub.id },
        data: { consecutiveFailureCount: 0, lastTriggeredAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[events] ${sub.subscriberModule.key} failed reacting to ${occurrence.eventType.key}: ${message}`);

      if (sub.onFailure === "ignore") continue; // no count increment, no active flip, no persisted error

      const consecutiveFailureCount = sub.consecutiveFailureCount + 1;
      const shouldDisable =
        sub.onFailure === "disable_after_n_failures" && consecutiveFailureCount >= MAX_CONSECUTIVE_FAILURES;

      await prisma.eventSubscription.update({
        where: { id: sub.id },
        data: {
          consecutiveFailureCount,
          lastError: message,
          active: shouldDisable ? false : sub.active,
        },
      });
    }
    // One subscriber's failure never blocks another subscriber's turn, and
    // never rethrows into the emitting Server Action — the action that
    // completed a task must succeed regardless of Kanban's reaction to it.
  }

  await prisma.eventOccurrence.update({ where: { id: occurrence.id }, data: { subscriptionsNotified: notified } });
}
```

`onFailure` semantics, exactly as `plan.md` §3.6 defines the enum:

| Value | Behavior on handler throw |
|---|---|
| `ignore` | Swallowed silently — no `consecutiveFailureCount` increment, no `lastError`, no `active` flip. Reserved for reactions where "sometimes silently missed" is truly fine. |
| `log_only` (default) | Logged (`console.error`, `lastError` persisted, `consecutiveFailureCount` incremented) but `active` stays `true` — Kanban's `task.completed` subscription uses this. |
| `disable_after_n_failures` | Same logging as `log_only`, plus: once `consecutiveFailureCount` reaches `MAX_CONSECUTIVE_FAILURES` (5), `active` flips to `false` and the subscription stops being dispatched to until a developer/admin flips it back — the concrete mechanism behind `ROADMAP.md` §7's "actually flips `active = false` after the Nth `consecutiveFailureCount`." |

---

## 7. Direct call vs. `EventSubscription` — the decision rule

Per the pre-established convention (`docs/seeding.md` §5.4,
`docs/project-structure.md` §3.3): **none of the 8 built-in modules react to
each other's events via `EventSubscription` in V1, with exactly one
structural exception.** Every other built-in-to-built-in reaction is a
direct, synchronous, permission-checked function call through the
dependency's public barrel (`@/modules/<dep>`), because the caller already
declares `dependsOnModules: [<dep>]` and wants the result *now*, as part of
its own request:

```ts
// src/modules/life-admin/actions/create-renewal.ts (excerpt) — direct call, no event needed
"use server";
import { createReminder } from "@/modules/reminders";

// life-admin's module.ts declares dependsOnModules: ["reminders"]
for (const offsetDays of renewal.reminderOffsetsDays) {
  await createReminder({
    householdId: renewal.householdId,
    title: renewal.title,
    targetMemberId: renewal.responsibleMemberId,
    sourceType: "renewal",
    sourceModule: "life_admin",
    sourceEntityId: renewal.id,
    firstRemindAt: subDays(renewal.expiryDate, offsetDays),
  });
}
```

### 7.1 Why Kanban is the one exception

`Task` ↔ Kanban card completion sync is bidirectional (`plan.md` §9 Q10), and
each direction needs a different mechanism *because `dependsOnModules` is a
one-way graph*:

- **Card → Task** (dragging a card into a `done`-typed column completes the
  task): `kanban`'s own `move-card` action calls `tasks`' `completeTask()`
  directly — ordinary, since `kanban` already declares `dependsOnModules:
  ["tasks"]`.
- **Task → Card** (completing a task from the plain list auto-moves its
  card): `tasks` has **no** `dependsOnModules` entry pointing at `kanban` —
  the dependency only ever runs `kanban → tasks`, never the reverse, because
  Tasks must work standalone with Kanban absent/disabled. `completeTask()`
  therefore has no barrel to call into for Kanban's behalf. It only emits
  `task.completed` (§4); `kanban` is the one built-in that closes the loop
  itself by subscribing to that event (§6's worked example above).

### 7.2 The rule, stated generally

| Situation | Mechanism |
|---|---|
| Caller needs the result synchronously, and already declares the dependency in `dependsOnModules` | **Direct barrel import** — e.g. `life-admin → reminders`, `finance → reminders`, `kanban → tasks`, `calendar → tasks` |
| Caller's dependency graph runs the *other* direction from the reaction needed (Tasks has no way to call into Kanban) | **`EventSubscription`** — Kanban's `task.completed` subscription is the only one of these among the 8 built-ins |
| A 9th/custom module wants to react to a built-in's event, and the two modules genuinely shouldn't need to know about each other | **`EventSubscription`** — this is the normal, expected use of the mechanism for anything past the original 8 |

Don't add a second built-in-to-built-in `EventSubscription` "to make the
seed feel more wired up" — Kanban's is required by the one-way dependency
graph, not a stylistic default (`docs/seeding.md` §5.4's own closing note).

---

## 8. `ModulePermissionDeclaration` + `ModuleGrant` — manifest vs. approval

Two different tiers of the same idea, deliberately kept as two models:

- **`ModulePermissionDeclaration`** — a module's own manifest, written once in
  its `module.ts`, of what it needs and why. Global/platform-catalog data —
  the same declaration applies to every household the module is relevant to.
- **`ModuleGrant`** — whether *one specific household* has actually said yes.
  Household-scoped, reviewable, revocable, fully audited.

```prisma
model ModulePermissionDeclaration {
  id             String         @id @default(cuid())
  moduleId       String
  module         Module         @relation(fields: [moduleId], references: [id])
  resourceDomain ResourceDomain // tasks | kanban | calendar | reminders | notes | finance | life_admin | members_household | notifications_email | cross_module_events
  accessLevel    AccessLevel    // read | write | read_write
  purpose        String         // shown to the household on review
  isRequired     Boolean        // false = module must degrade gracefully without it

  grants ModuleGrant[]

  @@unique([moduleId, resourceDomain, accessLevel])
}

model ModuleGrant {
  id                      String            @id @default(cuid())
  householdId             String
  household               Household         @relation(fields: [householdId], references: [id])
  moduleId                String
  module                  Module            @relation(fields: [moduleId], references: [id])
  permissionDeclarationId String
  permissionDeclaration   ModulePermissionDeclaration @relation(fields: [permissionDeclarationId], references: [id])
  status                  GrantStatus       @default(pending_review) // granted | revoked | pending_review
  grantedById             String?
  grantedBy               Member?           @relation("GrantedBy", fields: [grantedById], references: [id])
  grantedAt               DateTime?
  revokedById             String?
  revokedBy               Member?           @relation("RevokedBy", fields: [revokedById], references: [id])
  revokedAt               DateTime?

  @@unique([householdId, permissionDeclarationId])
}

enum ResourceDomain { tasks kanban calendar reminders notes finance life_admin members_household notifications_email cross_module_events }
enum AccessLevel    { read write read_write }
enum GrantStatus     { granted revoked pending_review }
```

### 8.1 Declaring what a module needs

```ts
// src/modules/finance/module.ts (excerpt)
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
    isRequired: false, // Finance must still fully function without this
  },
];
```

### 8.2 Seeding grants — the built-in vs. custom distinction, exactly

```ts
// src/lib/module-registry/permissions.ts
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Runs once, inside the same transaction that creates a Household. Also
 * re-runs (as an upsert, not a blind createMany) whenever a module —
 * including a 9th, developer-added one — registers a NEW
 * ModulePermissionDeclaration, so existing households pick up a
 * `pending_review` row for it without a manual per-household migration.
 */
export async function seedModuleGrantsForHousehold(db: Db, householdId: string) {
  const declarations = await db.modulePermissionDeclaration.findMany({ include: { module: true } });

  for (const decl of declarations) {
    await db.moduleGrant.upsert({
      where: { householdId_permissionDeclarationId: { householdId, permissionDeclarationId: decl.id } },
      update: {}, // never downgrade an existing decision when the seed re-runs
      create: {
        householdId,
        moduleId: decl.moduleId,
        permissionDeclarationId: decl.id,
        // Only a REQUIRED declaration of a BUILT-IN module is auto-granted.
        // A built-in's OPTIONAL declarations still start pending_review —
        // "all 8 apps work immediately with zero setup" only promises the
        // required set (plan.md §7); optional cross-module conveniences are
        // still something the household reviews explicitly.
        status: decl.isRequired && decl.module.kind === "built_in" ? "granted" : "pending_review",
        grantedAt: decl.isRequired && decl.module.kind === "built_in" ? new Date() : null,
      },
    });
  }
}
```

Every declaration of a `custom` module — required or not — always starts
`pending_review`, with no exception: this is `plan.md` §9 Q34's resolved
decision ("custom modules always require explicit household review... only
the 8 built-ins are auto-granted at signup") made literal in code.

### 8.3 Checking a grant before acting

```ts
// src/lib/module-registry/permissions.ts (continued)
import { prisma } from "@/lib/db";
import type { ResourceDomain, AccessLevel } from "@prisma/client";

export async function hasModuleGrant(
  householdId: string,
  moduleKey: string,
  resourceDomain: ResourceDomain,
  accessLevel: AccessLevel = "read",
): Promise<boolean> {
  const grant = await prisma.moduleGrant.findFirst({
    where: {
      householdId,
      status: "granted",
      module: { key: moduleKey },
      permissionDeclaration: { resourceDomain, accessLevel },
    },
  });
  return grant !== null;
}
```

### 8.4 Revoking is household-scoped, never platform-wide

Revoking a `granted` `ModuleGrant` disables that module **for that household
only** — it never touches `Module.status`/`healthStatus`, which stay
platform-wide facts about the code, not about any one household's choices
(`plan.md` §3.6: "revoking any of them disables the module for that household
only"). `docs/access-control.md` §7 owns the actual `reviewModuleGrant()`
Server Action and its role gating (`canManageModuleGrant()` — owner-only for
a required declaration, admin+ for an optional one); this doc's job stops at
"here's the row and what reading it means."

---

## 9. `ModuleSurfaceRegistration` — appearing everywhere, without per-surface code

```prisma
model ModuleSurfaceRegistration {
  id       String      @id @default(cuid())
  moduleId String
  module   Module      @relation(fields: [moduleId], references: [id])
  surface  SurfaceKind // dashboard_widget | global_search_provider | command_palette_action | navigation_item | quick_capture_target | email_notification_category
  label    String
  icon     String?
  target   String      // conceptual pointer — meaning depends on `surface`, see §9.1
  sortOrder Int        @default(0)
  enabled  Boolean      @default(true)

  @@unique([moduleId, surface, target])
}

enum SurfaceKind { dashboard_widget global_search_provider command_palette_action navigation_item quick_capture_target email_notification_category }
```

### 9.1 What `target` means per surface, and whether it needs a runtime map

Two different resolution paths, exactly like `EventSubscription` (§6.1) —
some `target` values are plain data Next.js can render directly, others name
a function/component that (per the same serverless-`import()` constraint)
needs a compile-time static map:

| `surface` | What `target` holds | Resolved how |
|---|---|---|
| `navigation_item` | A route path (`"/tasks"`) | Rendered directly as an `<Link href>` — no map needed |
| `dashboard_widget` | A widget component pointer (`"tasks/widgets/due-today"`) | `dashboardWidgets` static map → component |
| `quick_capture_target` | A create-function pointer (`"tasks.create"`) | `quickCaptureTargets` static map → function |
| `global_search_provider` | A search-function pointer (`"tasks/search"`) | `searchProviders` static map → function |
| `command_palette_action` | An action-function pointer (`"tasks.create"`, `"kanban.create-board"`) | `paletteActions` static map → function |
| `email_notification_category` | The `categoryKey` itself (`"task.assigned"`) — same dot-namespace as `ModuleEventType.key` | No map — rendered as a label/toggle row against `NotificationPreference`, never invoked |

```ts
// src/lib/module-registry/surfaces.ts
import { createTask } from "@/modules/tasks";
import { createNote } from "@/modules/notes";
import { createReminder } from "@/modules/reminders";
import { searchTasks } from "@/modules/tasks";
import { searchNotes } from "@/modules/notes";
import { TodayWidget } from "@/modules/dashboard/components/today-view";

export const quickCaptureTargets = {
  "tasks.create": createTask,
  "notes.create": createNote,
  "reminders.create": createReminder,
} as const;

export const searchProviders = {
  "tasks/search": searchTasks,
  "notes/search": searchNotes,
} as const;

export const dashboardWidgets = {
  "dashboard/widgets/today": TodayWidget,
} as const;

// paletteActions follows the identical shape — omitted for brevity.
```

Every one of these maps has exactly one flat entry per registered surface —
none of them behind an `if (moduleKey === ...)`. Adding a 9th module's
quick-capture target means adding one line to `quickCaptureTargets`, nothing
else in this file (§11).

**Don't register `navigation_item` ahead of the page it points to.** Every
other surface kind resolves through a static map (above) that doesn't exist
yet for most modules — an entry sitting unread in
`ModulePermissionDeclaration`/`ModuleSurfaceRegistration` is harmless,
forward-looking data, exactly the "architecture-ready, no live installer"
posture this doc is named for. `navigation_item` is the one exception: §9.2's
`Nav` component renders it directly as a real, clickable `<Link href>` the
moment it's seeded, with no map and no "does this route exist" check in
between. A module whose `src/app/(app)/<route>/page.tsx` isn't built yet
must leave `navigation_item` out of its `surfaceRegistrations` (see any of
`kanban`/`calendar`/`reminders`/`notes`/`finance`/`life-admin`/`dashboard`'s
`module.ts` for the pattern) — otherwise the seed produces a real dead link
in the app's nav. Add the `navigation_item` row in the same change that adds
the page, not before.

### 9.2 Rendering a surface — the same generic pattern six times

```tsx
// src/components/app-shell/nav.tsx (excerpt)
import { prisma } from "@/lib/db";
import Link from "next/link";

export async function Sidebar() {
  const items = await prisma.moduleSurfaceRegistration.findMany({
    where: { surface: "navigation_item", enabled: true, module: { status: "active" } },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <nav>
      {items.map((item) => (
        <Link key={item.id} href={item.target}>{item.label}</Link>
      ))}
    </nav>
  );
}
```

```tsx
// src/modules/dashboard/components/quick-capture.tsx (excerpt)
import { prisma } from "@/lib/db";
import { quickCaptureTargets } from "@/lib/module-registry/surfaces";

export async function QuickCapture() {
  const targets = await prisma.moduleSurfaceRegistration.findMany({
    where: { surface: "quick_capture_target", enabled: true, module: { status: "active" } },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div>
      {targets.map((t) => {
        const createFn = quickCaptureTargets[t.target as keyof typeof quickCaptureTargets];
        if (!createFn) return null; // registered but not wired into the map — fail closed, not a crash
        return <QuickCaptureButton key={t.id} label={t.label} onSubmit={createFn} />;
      })}
    </div>
  );
}
```

Global search and the command palette are two presentations of the same
registry (`plan.md` §4.1): both query `surface: "global_search_provider"` /
`surface: "command_palette_action"` respectively and resolve `target` through
`searchProviders`/`paletteActions`, identical shape to the two examples
above. **None of this — `Sidebar`, `QuickCapture`, search, palette,
notification-preference settings — is ever edited when a 9th module
registers.** Every one of them is generic over whatever rows exist in
`ModuleSurfaceRegistration` at read time; the only thing a new module adds is
its own manifest data (§11) plus, if it needs an invokable target, one line
in `surfaces.ts`.

The single documented exception to "surfaces never need per-module code" is
`src/modules/dashboard/queries/get-today.ts`'s `getToday()` — it composes a
fixed, product-designed "tasks due / today's events / upcoming bills / active
reminders" layout (`plan.md` §4.1), not a generic slot list, so it needs one
new import + one new `Promise.all` entry per Today-relevant module
(`docs/project-structure.md` §3.1 calls this out explicitly). Dashboard
*widgets* beyond the fixed Today layout, search, and the palette are the
generic, zero-code-change slots.

---

## 10. Graceful degradation, in code — every optional cross-module call, both directions

`plan.md` §7: *"isRequired: false = module must degrade gracefully without
it."* This has to be checked at **two independent levels**, and both apply
even to a direct barrel-import call (per the direct-call convention in §7 —
"direct" only means "no event bus," it never means "no check"):

1. **Platform level** — is the dependency module itself healthy?
   (`Module.status`/`healthStatus`, §3.)
2. **Household level** — has *this* household actually granted the calling
   module the relevant permission? (`ModuleGrant`, §8.)

```ts
// src/lib/module-registry/permissions.ts (continued)
import { prisma } from "@/lib/db";
import type { ResourceDomain, AccessLevel } from "@prisma/client";

/**
 * The one function every OPTIONAL cross-module call goes through before
 * acting — whether the call is a direct barrel import (§7) or something
 * reached via an EventSubscription handler (§6). Composes both levels: the
 * dependency module must be platform-healthy, AND this household must have
 * actually granted the calling module that resource domain.
 */
export async function canUseOptionalDependency(
  householdId: string,
  callingModuleKey: string,
  dependencyModuleKey: string,
  resourceDomain: ResourceDomain,
  accessLevel: AccessLevel = "write",
): Promise<boolean> {
  const dependency = await prisma.module.findUnique({ where: { key: dependencyModuleKey } });
  if (!dependency || dependency.status !== "active" || dependency.healthStatus !== "ok") {
    return false; // platform-wide: the dependency itself isn't in a usable state
  }
  return hasModuleGrant(householdId, callingModuleKey, resourceDomain, accessLevel);
}
```

```ts
// src/modules/finance/actions/handle-subscription-payment-needs-confirmation.ts
import { canUseOptionalDependency } from "@/lib/module-registry/permissions";
import { prisma } from "@/lib/db";
import type { Subscription } from "@prisma/client";

export async function handleSubscriptionPaymentNeedsConfirmation(subscription: Subscription) {
  const canCreateTask = await canUseOptionalDependency(
    subscription.householdId,
    "finance",
    "tasks",
    "tasks",
    "write",
  );
  if (!canCreateTask) {
    return; // degrade: no follow-up Task created; Finance's own record still saves/updates fine
  }

  await prisma.task.create({
    data: {
      householdId: subscription.householdId,
      title: `Confirm payment for ${subscription.name}`,
      sourceModule: "finance",
      sourceEntityId: subscription.id,
      createdById: subscription.responsibleMemberId,
      priority: "medium",
      visibility: "household",
    },
  });
}
```

For a **required** dependency (`isRequired: true`), the same
`canUseOptionalDependency`-style check still runs, but a `false` result means
the module itself is non-functional for that household, not merely one
feature skipped — the calling module's top-level actions/queries should
short-circuit with a clear, user-facing message rather than partially
executing:

```ts
// src/modules/meal-planning/actions/schedule-cook-reminder.ts (a 9th module's own required check)
import { hasModuleGrant } from "@/lib/module-registry/permissions";
import { ModuleNotGrantedError } from "@/lib/module-registry/errors";

export async function scheduleCookReminder(input: ScheduleCookReminderInput) {
  const granted = await hasModuleGrant(input.householdId, "meal_planning", "reminders", "write");
  if (!granted) {
    throw new ModuleNotGrantedError(
      "meal-planning needs Reminders access — ask a household owner/admin to approve it under Settings → Modules.",
    );
  }
  // ...proceed
}
```

### 10.1 The reverse direction: a disabled dependency must not break its dependents' own rendering

If `kanban` is ever disabled via code (`Module.status = "disabled"`), `Task`
rows are completely untouched — `boardId`/`columnId` stay set in the
database — but anything rendering "which board is this task on" must stop
resolving/rendering rather than erroring:

```tsx
// src/modules/tasks/components/task-board-badge.tsx
import { prisma } from "@/lib/db";

export async function TaskBoardBadge({ task }: { task: { boardId: string | null } }) {
  if (!task.boardId) return null;

  const kanban = await prisma.module.findUnique({ where: { key: "kanban" } });
  if (!kanban || kanban.status !== "active" || kanban.healthStatus !== "ok") {
    return null; // Kanban disabled/unhealthy — badge simply doesn't render; Task itself is untouched
  }

  return <BoardBadgeContent boardId={task.boardId} />;
}
```

Re-enabling `kanban` (flipping `status` back to `active`,
`recomputeDependentHealth` restoring `healthStatus: "ok"`) restores full
function immediately, with zero data loss — nothing about `Task` rows ever
changed while Kanban was disabled (`plan.md` §7's exact contract).

---

## 11. Adding module #9 — the registration sequence, entity by entity

This section is the *why these exact rows, in this exact order* behind
`AGENTS.md` §2's operational checklist (commands to run) and
`docs/project-structure.md` §9 (files to touch) — read those two for the
mechanical steps; this is the dependency order those steps rely on, using a
hypothetical `meal_planning` module.

1. **`Module`** first — nothing else has a valid foreign key without it.
   `kind: "custom"` (always, for a 9th+ module — §3), `status: "active"`,
   `dependsOnModules: ["life_admin"]` (soft — meal-planning reuses
   `ShoppingList`/`ShoppingListItem`, per `AGENTS.md` §2 Step 0's reuse
   table).
2. **`ModuleEventType`** rows next — e.g. `meal_planning.plan_published` —
   so anything declared in step 3 that references them by key
   (`EventSubscription.eventType`) has something to point at.
3. **`ModulePermissionDeclaration`** rows — what meal-planning needs
   (`reminders`/`write`/required — remind the cook; `life_admin`/`write`/not
   required — push ingredients onto a `ShoppingList`; `tasks`/`write`/not
   required — create a prep task) and why, per module (§8.1).
4. **`ModuleSurfaceRegistration`** rows — `navigation_item`,
   `quick_capture_target`, `global_search_provider` as relevant (§9) — this
   is the entirety of what makes it show up in nav/search/quick-capture;
   zero Dashboard/Sidebar/Search code changes.
5. **`EventSubscription`** rows, only if meal-planning reacts to another
   module's event (e.g. `task.completed`, to mark a meal-prep task's meal as
   prepped) — the normal, expected use of the mechanism for a 9th module
   (§7.2's table, second row).
6. **`ModuleGrant`** — deliberately **not** written by the module's own
   manifest at all. `seedModuleGrantsForHousehold()` (§8.2) runs this for
   every existing household once step 3's declarations exist, and every one
   of them lands `pending_review` because `kind: "custom"` — no exception,
   regardless of `isRequired`. This is the concrete difference from the
   original 8: nothing meal-planning does is usable by any household until
   an owner/admin reviews it under Settings → Modules
   (`docs/access-control.md` §7.3).

**Steps 1–5 are all additive rows in `meal_planning`'s own `module.ts`, plus
exactly two lines in shared files** — `src/lib/module-registry/registry.ts`'s
`moduleManifests` array (one import + one array entry) and, only if step 4
registered an invokable target, `src/lib/module-registry/surfaces.ts` (one
map entry). **Nothing about modules #1–8's own code changes.** If completing
a 9th module's implementation requires touching a file outside its own
folder plus those two lines, that's the signal to stop and re-read §1 of
this doc — you're special-casing, not registering.

```ts
// src/lib/module-registry/registry.ts — the one shared file every new module's import lands in
import * as dashboard from "@/modules/dashboard/module";
import * as tasks from "@/modules/tasks/module";
import * as kanban from "@/modules/kanban/module";
import * as calendar from "@/modules/calendar/module";
import * as reminders from "@/modules/reminders/module";
import * as notes from "@/modules/notes/module";
import * as finance from "@/modules/finance/module";
import * as lifeAdmin from "@/modules/life-admin/module";
import * as mealPlanning from "@/modules/meal-planning/module"; // ← the one line a 9th module adds

export const moduleManifests = [
  dashboard, tasks, kanban, calendar, reminders, notes, finance, lifeAdmin,
  mealPlanning,
];
```

`prisma/seed.ts` iterates `moduleManifests` generically (`docs/seeding.md`
§5.3's `seedPlatformCatalog()`) — running `pnpm prisma db seed` after adding
the one import above is what actually upserts every row in steps 1–5, keyed
by natural business keys (`Module.key`, `ModuleEventType.key`,
`(moduleId, resourceDomain, accessLevel)`, `(moduleId, surface, target)`,
`(subscriberModuleId, eventTypeId)`) so re-running it is always safe.

---

## 12. Contract stability — what `contractVersion` actually protects

`ModuleEventType.contractVersion` is bumped **only** on a breaking change to
`payloadSummary`'s shape (removing a field, changing a field's meaning,
renaming a key) — never on an additive change (adding an optional field).
Existing subscribers (`EventSubscription` rows, and any handler in
`eventHandlers`, §6.1) keep reading the old shape they were written against
until they're explicitly migrated; the platform doesn't force every
subscriber to update in lockstep with the emitter. In practice: a genuinely
breaking payload change to `task.completed` means either (a) the new shape
is additive enough that old readers ignore the new fields safely and
`contractVersion` doesn't need to move, or (b) it's a real break, in which
case ship it as a **new** key (e.g. `task.completed_v2`) rather than mutating
`task.completed` out from under existing subscribers, bump
`contractVersion` on the new `ModuleEventType` row, and migrate subscribers
one at a time. `Module.version` (semver-style, on the `Module` row itself)
is bumped whenever *any* exposed event/action/data shape changes, not just
breaking ones — `contractVersion` is specifically about a single event
type's payload promise, a narrower, sharper signal than the module's overall
version string.

---

## 13. Testing this layer

Colocated per `CLAUDE.md` rule 4 / `docs/testing.md`:

- `src/lib/events/dispatch.test.ts` — asserts each `onFailure` branch: an
  `ignore` subscription's failure leaves `consecutiveFailureCount` at 0; a
  `log_only` failure increments it but leaves `active: true`; a
  `disable_after_n_failures` subscription flips `active: false` exactly at
  the 5th consecutive failure, not before.
- `src/lib/module-registry/permissions.test.ts` — `hasModuleGrant()` and
  `canUseOptionalDependency()` against a seeded fixture: granted → `true`,
  `revoked`/`pending_review` → `false`; dependency `status: "disabled"` or
  `healthStatus: "degraded"` → `false` regardless of the household's own
  grant.
- `src/lib/module-registry/health.test.ts` — `recomputeDependentHealth()`
  correctly distinguishes `degraded` (optional dependency down) from
  `missing_dependency` (required dependency down), and leaves unrelated
  modules' `healthStatus` untouched.
- `src/modules/kanban/events/subscribers.test.ts` — `onTaskCompleted()`
  moves a card to the first `done`-typed column; no-ops (doesn't throw) when
  the task has no board, or the board has no `done`-typed column.
- A cross-module Playwright spec, `e2e/module-grant-review.spec.ts`
  (`docs/project-structure.md` §2), exercises the end-to-end path: a
  `pending_review` custom-module grant blocks its feature, an admin approves
  it under Settings → Modules, the feature starts working — without a page
  reload revealing any hardcoded per-module branch anywhere in the stack.

---

## Appendix: file map

| File | Purpose |
|---|---|
| `src/lib/module-registry/types.ts` | Shared TS types for manifest arrays (`EventTypeDeclaration`, `PermissionDeclaration`, `SurfaceRegistration`, `EventSubscriptionDeclaration`) |
| `src/lib/module-registry/registry.ts` | `moduleManifests` — the one array every module's import lands in |
| `src/lib/module-registry/surfaces.ts` | Static `target` → component/function maps (`quickCaptureTargets`, `searchProviders`, `dashboardWidgets`, `paletteActions`) |
| `src/lib/module-registry/permissions.ts` | `hasModuleGrant()`, `canUseOptionalDependency()`, `seedModuleGrantsForHousehold()` |
| `src/lib/module-registry/health.ts` | `recomputeDependentHealth()` |
| `src/lib/events/emit.ts` | `emitEvent()` — creates the `EventOccurrence`, calls dispatch |
| `src/lib/events/dispatch.ts` | `dispatchToSubscribers()` — the `onFailure` state machine |
| `src/lib/events/handlers.ts` | Static `eventHandlers` map — `EventSubscription`'s equivalent of `surfaces.ts` |
| `src/modules/<key>/module.ts` | One module's `moduleRegistration` / `eventTypes` / `permissionDeclarations` / `surfaceRegistrations` / `eventSubscriptions` |
| `src/modules/<key>/events/emitters.ts` | Typed wrappers around `emitEvent()` for this module's own event types |
| `src/modules/<key>/events/subscribers.ts` | This module's reactions to other modules' events (only `kanban` has one among the 8 built-ins) |
| `prisma/seed.ts` → `seedPlatformCatalog()` | Upserts every manifest's rows — see `docs/seeding.md` §5.3 for the full script |
| `src/app/(app)/settings/modules/page.tsx` | The one end-user-facing screen — `ModuleGrant` review/revoke (`docs/access-control.md` §7.3) |
