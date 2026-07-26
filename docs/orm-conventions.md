# ORM Conventions (Prisma)

How every Home OS model is written, named, scoped, migrated, and evolved.
This is the harness's Prisma rulebook — if a `.prisma` file or a migration
does something this doc doesn't cover, that's a gap in the harness, not
permission to improvise; extend this doc in the same change.

> **Filename note for whoever reconciles the harness docs.** This file is
> canonically **`docs/orm-conventions.md`** — that's its real, on-disk path.
> Several other harness docs currently reference the Prisma conventions doc
> under a different name, **`docs/orm-conventions.md`**, instead —
> [`CLAUDE.md`](../CLAUDE.md), [`docs/auth.md`](./auth.md)
> (`"see docs/orm-conventions.md and the root stack decision"`), and
> [`docs/access-control.md`](./access-control.md) (`"Companion docs:
> docs/orm-conventions.md (full Prisma schema, entity field reference)"`, plus
> three more inline references). **This doc resolves the collision in favor
> of its own actual filename:** every one of those `docs/orm-conventions.md`
> references means this document, and each should be updated to
> `docs/orm-conventions.md` (including `CLAUDE.md`'s doc index) the next time
> its file is touched — this file is not the one that moves. Don't leave both
> names in play; `docs/orm-conventions.md` is the name that wins.

Companion docs, not duplicated here: [`docs/access-control.md`](./access-control.md)
owns the `visibilityWhere()` / `ObjectShare` / `ModuleGrant` enforcement logic
that *sits on top of* the schema this doc defines; [`docs/auth.md`](./auth.md)
owns the Supabase Auth ↔ `Member` link and session resolution. This doc owns
the schema itself: file layout, naming, tenant-scoping at the data layer,
polymorphic references, and the migration lifecycle.

---

## 1. Schema file organization

**Decision: one file, `prisma/schema.prisma`, organized internally into
ordered section banners — not Prisma's multi-file `prisma/schema/` folder
support.**

```bash
pnpm dlx prisma init --datasource-provider postgresql
# → creates prisma/schema.prisma and .env
```

Why single-file, concretely, for this repo: [`ROADMAP.md`](../ROADMAP.md)'s
Phase 0 checklist already scaffolds the project with
`pnpm dlx prisma init --datasource-provider postgresql` (which generates a
single `prisma/schema.prisma`), and every module section in `ROADMAP.md`
titles its entity list `### Entities (prisma/schema.prisma)`. Both
[`docs/auth.md`](./auth.md) and [`docs/access-control.md`](./access-control.md)
already show real, committed code excerpted from `prisma/schema.prisma` as a
single file. Splitting into a multi-file schema later (Prisma supports it —
one `.prisma` file per module under a folder, referenced from
`package.json`'s `"prisma": { "schema": "prisma/schema" }` or a
`prisma.config.ts`) is a mechanical, low-risk refactor if the file ever
becomes unwieldy. Un-splitting a folder back into the single file every other
harness doc already assumes would be the more disruptive direction — so start
single-file.

> **Known harness inconsistency to fix:** `AGENTS.md`'s project-structure
> tree currently shows a multi-file `prisma/schema/` folder (`household.prisma`,
> `tasks.prisma`, `kanban.prisma`, …) and its step-by-step "add a 9th module"
> example writes to `prisma/schema/meal-planning.prisma`. That contradicts the
> single-file convention `ROADMAP.md`/`auth.md`/`access-control.md` already
> committed to. Fix `AGENTS.md`'s tree and example to say `prisma/schema.prisma`
> (a single file, new models appended under the relevant section banner) —
> don't quietly split the schema into that folder shape without updating this
> doc and re-running the reconciliation across all four docs.

### 1.1 Internal organization

The single file stays navigable via fixed, ordered section-banner comments —
one banner per product module, in the exact order `ROADMAP.md` uses, so
"where is `Renewal` defined" is always "search for the Life Admin banner,"
never a grep across an undifferentiated blob:

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // pooled (6543) — used at runtime
  directUrl = env("DIRECT_URL")   // direct (5432) — used by `prisma migrate`
}

// =====================================================================
// SHARED / CROSS-MODULE — imported implicitly by every section below
// =====================================================================
enum Visibility {
  private
  household
  specific_members
}

// =====================================================================
// 1. HOUSEHOLD & SHARING  (owning moduleKey: "household" — platform core,
//    not itself a `Module` row; every other module depends on it)
// =====================================================================
model Household { /* … */ }
model Member { /* … */ }
model Invite { /* … */ }
model ObjectShare { /* … */ }
model NotificationPreference { /* … */ }
model DigestSubscription { /* … */ }
model Notification { /* … */ }

// =====================================================================
// 2. TASKS, KANBAN & CALENDAR  (moduleKeys: "tasks", "kanban", "calendar")
// =====================================================================
model Task { /* … */ }
model TaskRecurrenceRule { /* … */ }
model Tag { /* … */ }
model TaskTag { /* … */ }
model KanbanBoard { /* … */ }
model KanbanColumn { /* … */ }
model Event { /* … */ }

// =====================================================================
// 3. REMINDERS & NOTES  (moduleKeys: "reminders", "notes")
// =====================================================================
model Reminder { /* … */ }
model ReminderOccurrence { /* … */ }
model Note { /* … */ }
model NoteTag { /* … */ }
model NoteLink { /* … */ }

// =====================================================================
// 4. FINANCE  (moduleKey: "finance")
// =====================================================================
model Category { /* … */ }
model Transaction { /* … */ }
model TransactionSplit { /* … */ }
model Settlement { /* … */ }
model Budget { /* … */ }
model Subscription { /* … */ }
// MonthlySummary / MemberBalance are NOT modeled here — see §7.2.

// =====================================================================
// 5. LIFE ADMIN  (moduleKey: "life_admin")
// =====================================================================
model Document { /* … */ }
model Renewal { /* … */ }
model Contact { /* … */ }
model ShoppingList { /* … */ }
model ShoppingListItem { /* … */ }

// =====================================================================
// 6. PLATFORM & EXTENSIBILITY  (the module system itself)
// =====================================================================
model Module { /* … */ }
model ModuleEventType { /* … */ }
model EventSubscription { /* … */ }
model EventOccurrence { /* … */ }
model ModulePermissionDeclaration { /* … */ }
model ModuleGrant { /* … */ }
model ModuleSurfaceRegistration { /* … */ }
```

Dashboard (`ROADMAP.md` §6) and Email Notifications (`ROADMAP.md` §8) add no
models of their own — they're query/scheduling layers over the sections
above — so they get no banner.

---

## 2. Naming conventions

### 2.1 Models

PascalCase, singular, **exactly** the entity names in `plan.md` — never
abbreviate, pluralize, or re-word (`KanbanBoard`, not `Board`; `ShoppingListItem`,
not `ListItem`). The full model inventory, cross-referenced against `plan.md`
§3 and marked scoped/global (see §3):

| Model | Section | Tenant scope |
|---|---|---|
| `Household` | Household & Sharing | root — not itself scoped |
| `Member` | Household & Sharing | scoped |
| `Invite` | Household & Sharing | scoped |
| `ObjectShare` | Household & Sharing | scoped |
| `NotificationPreference` | Household & Sharing | scoped |
| `DigestSubscription` | Household & Sharing | scoped |
| `Notification` | Household & Sharing | scoped |
| `Task` | Tasks/Kanban/Calendar | scoped |
| `TaskRecurrenceRule` | Tasks/Kanban/Calendar | scoped (denormalized, §3.3) |
| `Tag` | Tasks/Kanban/Calendar | scoped |
| `TaskTag` | Tasks/Kanban/Calendar | scoped (denormalized) |
| `KanbanBoard` | Tasks/Kanban/Calendar | scoped |
| `KanbanColumn` | Tasks/Kanban/Calendar | scoped (denormalized) |
| `Event` | Tasks/Kanban/Calendar | scoped |
| `Reminder` | Reminders & Notes | scoped |
| `ReminderOccurrence` | Reminders & Notes | scoped (denormalized) |
| `Note` | Reminders & Notes | scoped |
| `NoteTag` | Reminders & Notes | scoped (denormalized) |
| `NoteLink` | Reminders & Notes | scoped (denormalized) |
| `Category` | Finance | scoped |
| `Transaction` | Finance | scoped |
| `TransactionSplit` | Finance | scoped (denormalized) |
| `Settlement` | Finance | scoped |
| `Budget` | Finance | scoped |
| `Subscription` | Finance | scoped |
| `Document` | Life Admin | scoped |
| `Renewal` | Life Admin | scoped |
| `Contact` | Life Admin | scoped |
| `ShoppingList` | Life Admin | scoped |
| `ShoppingListItem` | Life Admin | scoped (denormalized) |
| `Module` | Platform | **global** (platform catalog) |
| `ModuleEventType` | Platform | **global** |
| `EventSubscription` | Platform | **global** |
| `EventOccurrence` | Platform | scoped |
| `ModulePermissionDeclaration` | Platform | **global** |
| `ModuleGrant` | Platform | scoped |
| `ModuleSurfaceRegistration` | Platform | **global** |

`MonthlySummary` and `MemberBalance` are deliberately **absent** — see §7.2.

### 2.2 Fields

camelCase, exactly as `plan.md` spells them per entity (`dueDateAllDay`,
`alertThresholdPercent`, `reminderOffsetsDays`, `variableAmount`,
`autoCreateTransaction`). Every model additionally gets two fields `plan.md`
doesn't bother spelling out because they're infrastructure, not product
data — add them even where the digest's field list omits them:

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

### 2.3 Foreign keys to `Member` — resolving the plan's own inconsistency

`plan.md` itself says, of the visibility "owner" field: *"named differently
per entity (`createdById`, `authorMemberId`, `uploadedBy`, `paidBy`, etc.,
called out explicitly below)"* (`plan.md` §5, on sharing). That's not sloppy
writing to be "fixed" into one uniform name — it's an explicit product
decision that different entities call this relationship different things.
**Preserve the plan's exact field name per entity, don't homogenize.**

What *is* this doc's job: give a single mechanical rule for turning each of
those prose names into the two Prisma fields every relation needs (a scalar
FK column + the relation object), since Prisma requires them to have
different names:

- If the plan's own name already ends in `Id` (`assigneeId`, `createdById`,
  `completedById`, `targetMemberId`, `authorMemberId`, `createdByMemberId`,
  `invitedByMemberId`, `acceptedByMemberId`) — **that name is the scalar
  column.** The relation object field drops the trailing `Id`
  (`assignee`, `createdBy`, `completedBy`, `targetMember`, `authorMember`,
  `createdByMember`, `invitedBy`, `acceptedBy`).
- If the plan's own name has no `Id` suffix at all (`uploadedBy`, `paidBy`,
  `checkedBy`, `addedBy`, `responsibleMember`, `fromMember`, `toMember`,
  `member` on `Budget`) — **that name is the relation object field.** The
  scalar column is that name with `Id` appended (`uploadedById`, `paidById`,
  `checkedById`, `addedById`, `responsibleMemberId`, `fromMemberId`,
  `toMemberId`, `memberId`).

```prisma
model Document {
  // plan.md says "uploadedBy (relation, required)" — bare name → relation object
  uploadedBy   Member @relation(fields: [uploadedById], references: [id])
  uploadedById String                      // scalar column = relation name + "Id"
}

model Reminder {
  // plan.md already spells the scalar: "createdByMemberId (relation → Member, required)"
  createdByMemberId String
  createdByMember   Member @relation(fields: [createdByMemberId], references: [id])
}
```

> **Cross-doc note:** `docs/access-control.md` §5.2's `ownerField` table uses
> the bare plan names directly as the Prisma filter key (e.g.
> `{ [scope.ownerField]: actingMember.id }` with `ownerField: "uploadedBy"`).
> Under this convention that only compiles if `ownerField` holds the
> **scalar** column name — so that table's `uploadedBy`/`createdBy`/`paidBy`
> entries need the `Id` suffix (`uploadedById`, `createdById`, `paidById`)
> once the real schema lands, and `visibilityWhere()`'s call sites need the
> matching update. Reconcile that table against this rule in the same PR that
> writes the `Document`/`Renewal`/`Contact`/`ShoppingList`/`Transaction`
> models. `access-control.md` also already flags that `Transaction` has no
> dedicated creator field in the plan and uses `paidBy`/`paidById` as the
> visibility-owner proxy — if a real `createdById` is ever added to
> `Transaction`, update both docs and that call site together.
>
> `TransactionSplit.settledBy` is the one field that looks like this pattern
> but isn't: `plan.md` §3.4 defines it as `settledBy (relation → Settlement,
> optional)` — it points at the `Settlement` that resolved the split, not at
> a `Member`. Model it as `settledById String? / settledBy Settlement?
> @relation(...)`, not as a `Member` relation.

### 2.4 Enums

Type name PascalCase (`MemberRole`, `TaskPriority`, `RenewalStatus`). Values
are written **exactly as `plan.md` spells them** — lowercase, snake_case for
multi-word values (`one_off`, `registration_license`,
`home_service_provider`) — never re-cased to `SCREAMING_SNAKE_CASE`. This
isn't a style preference: `categoryKey` (`NotificationPreference`) and
`ModuleEventType.key` share one dot-namespaced vocabulary with these same
enum values embedded in it (`task.assigned`, `bill.due_soon` →
`finance.subscription_due_soon` once implemented, see §2.5), and
`resourceDomain` values (`life_admin`, `members_household`,
`notifications_email`, `cross_module_events`) are themselves lowercase
snake_case straight from `plan.md` §7. One casing rule, applied everywhere a
"key" appears, means a value copy-pasted between a Prisma enum, a TS string
literal union, a `categoryKey`, and a JSON payload is never silently wrong
because someone re-cased it in one of the four places.

```prisma
enum TaskPriority { low medium high urgent }
enum RenewalType {
  warranty
  insurance
  registration_license
  membership_subscription
  certificate_id
  lease_contract
  domain_hosting
  other
}
```

### 2.5 `Module.key` / `moduleKey` / `resourceDomain`: snake_case, not kebab-case

`plan.md` §3.1 gives the concrete example directly: *"`moduleKey` (string,
required) — e.g. `tasks`, `notes`, `finance`, `life_admin`."* `resourceDomain`
is spelled the same way (`life_admin`, `members_household`,
`notifications_email`, `cross_module_events`, per `plan.md` §7). Treat
**`Module.key`, `moduleKey` (on `ObjectShare`/`Notification`), and
`resourceDomain` as one snake_case identifier namespace** — `life_admin`, not
`life-admin`.

`ModuleEventType.key` is dot-namespaced on top of that: `<Module.key>.<event_name>`,
both segments snake_case (`task.assigned`, `reminder.due`,
`household.invite_received`). Where `plan.md`'s own prose uses a colloquial
shorthand that predates the locked entity name — e.g. it writes
`bill.due_soon` even though "bills" collapsed into the single `Subscription`
entity owned by the `finance` module — resolve it to the real module key
before writing code: the concrete event is `finance.subscription_due_soon`,
not a literal `bill` module. Don't take plan-prose event names as literal
identifiers; always resolve them to `<Module.key>.<snake_case_event>` first.

Route segments/folders are a *different*, unrelated namespace and stay
kebab-case for URL friendliness (`app/(app)/life-admin/...`) — that's normal
Next.js convention, not this doc's concern, and the two are allowed to look
similar without being the same string.

> **Known harness inconsistency to fix:** `AGENTS.md`'s "add a 9th module"
> walkthrough registers its example module as `key: 'meal-planning'`
> (kebab-case) and its folder tree implies `modules/life-admin/` maps
> straight onto `Module.key`. Per `plan.md`'s own `life_admin` example (and
> `docs/access-control.md`'s `moduleKey: "life_admin"` usage), the `Module.key`
> value should be `meal_planning` / `life_admin` (snake_case); only the route
> folder (`app/(app)/meal-planning`, `modules/life-admin/`) stays
> kebab-case. Fix `AGENTS.md`'s example accordingly.

### 2.6 IDs — `cuid()`, always plain `String`

```prisma
id String @id @default(cuid())
```

No `@db.Uuid`, on any model, including columns that mirror a genuinely
`uuid`-typed Postgres column on Supabase's side (see §6). This matches the
`Household`/`Member` models already committed in `ROADMAP.md`'s Phase 0
checklist and `docs/auth.md`'s `Member` excerpt — both use
`@default(cuid())` with no `@db.Uuid` anywhere. Every foreign key scalar
(`householdId`, `assigneeId`, `categoryId`, …) is a plain `String` for the
same reason: Prisma-generated `cuid()` values are the only kind of id this
schema ever produces, so there's never a mixed-type join to reconcile.

### 2.7 Table/column mapping — none

No `@@map`/`@map`. Table and column names are Prisma's defaults (the exact
model/field name; Postgres quotes the mixed-case identifier automatically).
This matches every schema excerpt already committed in `ROADMAP.md`,
`docs/auth.md`, and `docs/access-control.md` — none of them use `@@map`. The
trade-off (raw `psql`/Supabase SQL editor sessions must quote identifiers,
e.g. `SELECT * FROM "Task" WHERE "dueDate" < now()`) is accepted in exchange
for one name per concept instead of two. If a specific table ever needs a
hand-tuned Postgres-level name (rare), add `@@map`/`@map` locally and note
why in a comment — don't reopen this as a blanket policy without updating
this doc.

### 2.8 Computed status fields are never stored columns

`plan.md` is explicit that `Task`'s `open | overdue | completed` status is
*computed*, with `completedAt` as "the single source of truth for completion,
not a boolean." Generalize that: **any status derivable from other columns on
the same row is a query-time computation, never a duplicated stored
column.** `Renewal.status` and `ReminderOccurrence.status` ARE stored columns
— they're not purely derivable (they reflect explicit workflow transitions:
"marking a renewal renewed always prompts the member to confirm," a scheduled
sweep flips `expired`→archived) — the rule is about redundant derived state,
not about every enum needing to disappear.

```ts
// modules/tasks/queries/task-status.ts
export function getTaskStatus(task: Pick<Task, "completedAt" | "dueDate">): "open" | "overdue" | "completed" {
  if (task.completedAt) return "completed";
  if (task.dueDate && task.dueDate < new Date()) return "overdue";
  return "open";
}
```

---

## 3. The `householdId` tenant-scoping convention

Home OS is multi-tenant with **no cross-household data sharing of any kind**
(`plan.md` §1, §9). Every model in §2.1's table marked "scoped" carries a
`householdId String` column plus `@@index([householdId])` at minimum.

### 3.1 Denormalize `householdId` onto every scoped table, even child rows

Several models could technically derive their household only by walking a
parent relation (`TaskTag` → `Task` → `householdId`; `KanbanColumn` →
`KanbanBoard` → `householdId`; `TransactionSplit`/`ReminderOccurrence` →
their parent row; `ShoppingListItem` → `ShoppingList`). **Add the column
directly anyway.** The convention is: *if a row can ever appear on the
left-hand side of a `WHERE` clause in a data-access query, it carries
`householdId` directly* — no exceptions for "it's derivable." This trades a
few bytes of write-time duplication for a uniform rule: every tenant-scoped
query filters on a column that's always present on the model being queried,
never a relation the caller has to remember to join through correctly.

```prisma
model TaskTag {
  id          String @id @default(cuid())
  taskId      String
  task        Task   @relation(fields: [taskId], references: [id])
  tagId       String
  tag         Tag    @relation(fields: [tagId], references: [id])
  householdId String // denormalized from task.householdId — see §3.1

  @@unique([taskId, tagId])
  @@index([householdId])
}
```

### 3.2 Enforcement: manual, explicit `householdId` — plus an automated guard rail

**Primary mechanism (already in force — see `docs/access-control.md` §4 and
§6):** every household-scoped query includes `householdId` explicitly in its
`where` (reads) or `data` (creates), sourced only from `requireMember()` /
`requireMember()`, never from a client-supplied parameter. That's a manual
discipline backed by code review and the allow/deny tests in
`docs/access-control.md` §10 — this doc does not replace it with an
automatic query-rewriting layer, because silently injecting `householdId`
into a query that forgot it can mask the exact bug it should surface (e.g. a
query built from a lookup done against the *wrong* household would silently
"work" instead of correctly returning nothing).

**Secondary mechanism — an assertion, not a rewrite:** a Prisma Client
Extension wraps the shared `prisma` singleton and **throws** if a
tenant-scoped model is queried without `householdId` present, rather than
supplying it. This exists purely as an automated backstop for the case a
reviewer misses — every correctly-written query already satisfies it and
never notices it's there.

```ts
// lib/db/tenant-guard.ts
import { Prisma } from "@prisma/client";

// Keep in sync with §2.1's "scoped" column — every model in that list
// except the platform-catalog globals (Module, ModuleEventType,
// EventSubscription, ModulePermissionDeclaration, ModuleSurfaceRegistration)
// and the tenant root (Household) itself.
const TENANT_SCOPED_MODELS = new Set([
  "Member", "Invite", "ObjectShare", "NotificationPreference",
  "DigestSubscription", "Notification",
  "Task", "TaskRecurrenceRule", "Tag", "TaskTag",
  "KanbanBoard", "KanbanColumn", "Event",
  "Reminder", "ReminderOccurrence", "Note", "NoteTag", "NoteLink",
  "Category", "Transaction", "TransactionSplit", "Settlement",
  "Budget", "Subscription",
  "Document", "Renewal", "Contact", "ShoppingList", "ShoppingListItem",
  "EventOccurrence", "ModuleGrant",
]);

const READ_OR_UPDATE_OPS = new Set([
  "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy", "update", "updateMany", "upsert", "delete", "deleteMany",
]);

function whereHasHouseholdId(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  if ("householdId" in where) return true;
  // AND/OR/NOT compositions used by visibilityWhere() (docs/access-control.md §5)
  return ["AND", "OR"].some((key) => {
    const branch = (where as Record<string, unknown>)[key];
    return Array.isArray(branch) && branch.some(whereHasHouseholdId);
  });
}

export const tenantGuardExtension = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

        if (READ_OR_UPDATE_OPS.has(operation)) {
          if (!whereHasHouseholdId((args as { where?: unknown }).where)) {
            throw new Error(
              `Refusing ${model}.${operation}: missing householdId in \`where\`. ` +
                `See docs/orm-conventions.md §3 and docs/access-control.md §6.`,
            );
          }
        }
        if (operation === "create") {
          const data = (args as { data?: Record<string, unknown> }).data;
          if (!data?.householdId) {
            throw new Error(`Refusing ${model}.create: missing householdId in \`data\`.`);
          }
        }
        if (operation === "createMany") {
          const rows = (args as { data?: Record<string, unknown>[] }).data ?? [];
          if (rows.some((row) => !row.householdId)) {
            throw new Error(`Refusing ${model}.createMany: every row needs householdId.`);
          }
        }
        return query(args);
      },
    },
  },
});
```

```ts
// lib/db.ts — the shared singleton every module imports
import { PrismaClient } from "@prisma/client";
import { tenantGuardExtension } from "./db/tenant-guard";

const prismaClient = new PrismaClient();

export const prisma = prismaClient.$extends(tenantGuardExtension);
```

Platform-catalog models (`Module`, `ModuleEventType`, `EventSubscription`,
`ModulePermissionDeclaration`, `ModuleSurfaceRegistration`) and `Household`
itself pass straight through — they're intentionally queried without a
`householdId`, since they either have none or (`Household`) *are* the tenant
boundary.

**One narrow, explicit exception: resolving a Member from its Supabase Auth
identity.** `requireMember()` (`docs/auth.md` §6), `login()`'s `lastLoginAt`
touch, and the confirmation callback's `emailVerifiedAt` touch all look up a
`Member` by `supabaseUserId` alone — that lookup is *how* `householdId` gets
resolved in the first place, so it can never itself supply one. This is safe
because `Member.supabaseUserId` is globally `@unique` (`docs/auth.md` §1): a
query keyed on it can only ever match one row, in exactly one household. Any
other tenant-scoped query still goes through the guarded `prisma` singleton.

```ts
// lib/db.ts
export const prisma = prismaClient.$extends(tenantGuardExtension);

// The one deliberate bypass — see the paragraph above. Never use this for
// anything except a supabaseUserId-keyed Member lookup/update.
export const prismaAuthBootstrap = prismaClient;
```

```ts
// lib/auth/session.ts (excerpt)
const member = await prismaAuthBootstrap.member.findUnique({
  where: { supabaseUserId: user.id },
  include: { household: true },
});
```

### 3.3 Uniqueness/index invariants that encode a business rule

Several plan invariants are enforced as a compound unique constraint, not
application code alone:

```prisma
// Member.email: "unique per household, not globally" (plan.md §2.2)
@@unique([householdId, email])

// Note journal entries: "one entry per member per day, upserted" (plan.md §3.6)
@@unique([authorMemberId, entryDate])

// ObjectShare: don't let the same object get shared with the same member twice
@@unique([householdId, moduleKey, objectType, objectId, sharedWithMemberId])

// ModuleGrant: one grant row per household × declaration
@@unique([householdId, permissionDeclarationId])
```

> **Cross-doc note:** `docs/access-control.md`'s `visibilityWhere()` (§5.3)
> queries this same column as `sharedWithMember` (no `Id` suffix) — e.g.
> `where: { ..., sharedWithMember: actingMember.id }`. Per §2.3's FK-naming
> rule, a bare `sharedWithMember` would be the **relation object** field, not
> a scalar you can filter a `where` clause on; the actual scalar FK column is
> `sharedWithMemberId`, matching both the `@@unique` above and `CLAUDE.md`'s
> own `ObjectShare` query example (`sharedWithMemberId: memberId`).
> `sharedWithMemberId` is the name that ships in the schema — fix
> `access-control.md`'s call site to match once `ObjectShare` is built, don't
> add a second `sharedWithMember` column to reconcile it the other way.

**Gotcha — Prisma's schema DSL has no partial (`WHERE`-qualified) unique
index.** Two plan invariants need exactly that:

- `ReminderOccurrence`: *"only one live occurrence per reminder at a time"* —
  needs `UNIQUE (reminderId) WHERE status IN ('pending', 'notified', 'snoozed')`,
  not a plain `@@unique([reminderId])` (which would forbid ever creating the
  *next* occurrence once the current one resolves).
- `Note`: the journal uniqueness above technically only needs to apply
  `WHERE noteType = 'journal'` — a `standard` note has no `entryDate` at all,
  so in practice the plain composite unique above is safe (a `NULL`
  `entryDate` never collides in Postgres), but don't assume that generalizes
  to every future partial-uniqueness need.

Convention for this case: declare the ordinary (non-partial) index in
`schema.prisma` so Prisma's migration diffing stays aware of the columns
involved, then hand-edit the generated migration:

```bash
pnpm prisma migrate dev --create-only --name reminder_occurrence_one_live
```

```sql
-- HAND-EDITED: Prisma's schema DSL can't express a partial unique index.
-- Do not let a future `prisma migrate dev` regenerate/drop this file's intent.
CREATE UNIQUE INDEX "reminder_occurrences_one_live_per_reminder"
  ON "ReminderOccurrence" ("reminderId")
  WHERE "status" IN ('pending', 'notified', 'snoozed');
```

Then run `pnpm prisma migrate dev` to apply it. Mark every hand-edited
migration file with a `-- HAND-EDITED:` banner comment for exactly this
reason — so the next person editing the schema knows not to trust
`prisma migrate dev`'s autogenerated diff blindly for that table.

---

## 4. Modeling polymorphic / generic references

Prisma has no native polymorphic relation (a single field that can point at
rows in *any one of several tables*, decided per row). Four places in the
plan need exactly that shape:

| Model | Fields | Points at |
|---|---|---|
| `Task` | `sourceModule`, `sourceEntityId` | whatever module auto-created this task |
| `Reminder` | `sourceModule`, `sourceEntityId` (+ `sourceType` enum) | the subscription/renewal/budget/task/document that triggered it |
| `Notification` | `sourceModule`, `sourceEntityType`, `sourceEntityId` | any event's originating entity |
| `Document` | `linkedEntityType`, `linkedEntityId` | renewal/contact/subscription/task/note/event |
| `NoteLink` | `linkedEntityModule`, `linkedEntityType`, `linkedEntityId` | task/subscription/event |
| `ObjectShare` | `moduleKey`, `objectType`, `objectId` | any shareable entity, from any module |

### 4.1 The pattern: plain scalars, no `@relation`, resolved at the application layer

Every one of these is modeled as **plain scalar columns with no Prisma
`@relation` and no foreign key constraint** — Postgres has no way to enforce
"this id exists in whichever table `objectType` names," and Prisma has no way
to declare it. The type/module discriminator is a plain `String`, not a
Prisma enum, deliberately: `Module.key` is an open, extensible set (a 9th
module registers a new key at runtime, per `plan.md` §7), so hard-coding it
into an enum would require a migration every time a module is added —
exactly the coupling the module system exists to avoid.

```prisma
model Task {
  id            String    @id @default(cuid())
  householdId   String
  household     Household @relation(fields: [householdId], references: [id])
  title         String
  // …
  // --- polymorphic origin pointer: plain scalars, no @relation ---
  // Populated only when another module auto-created this task, e.g.
  // sourceModule = "finance", sourceEntityId = <Subscription.id> when a
  // subscription payment needs manual confirmation (see
  // docs/access-control.md §7.2's handleSubscriptionPaymentNeedsConfirmation).
  sourceModule   String?
  sourceEntityId String?

  @@index([householdId])
  @@index([sourceModule, sourceEntityId])
}
```

Resolving the pointer back into something renderable is an explicit,
per-module registry — never a generic "look it up by table name" helper,
since there is no table-name-keyed lookup Prisma can do safely:

```ts
// modules/platform/resolve-source-entity.ts
import { prisma } from "@/lib/db";

type SourceRef = { module: string; entityId: string };
type Resolved = { label: string; href: string } | null;
type Resolver = (entityId: string, householdId: string) => Promise<Resolved>;

const resolvers: Record<string, Resolver> = {
  finance: async (entityId, householdId) => {
    const subscription = await prisma.subscription.findFirst({
      where: { id: entityId, householdId },
    });
    return subscription
      ? { label: subscription.name, href: `/finance/subscriptions/${subscription.id}` }
      : null; // subscription deleted — graceful null, never throws
  },
  life_admin: async (entityId, householdId) => {
    const renewal = await prisma.renewal.findFirst({ where: { id: entityId, householdId } });
    return renewal ? { label: renewal.title, href: `/life-admin/renewals/${renewal.id}` } : null;
  },
  // one entry per module that can be a `sourceModule`/`moduleKey` origin
};

/** Never throws — an unknown or since-removed module degrades to `null`. */
export async function resolveSourceEntity(ref: SourceRef | null, householdId: string): Promise<Resolved> {
  if (!ref) return null;
  const resolver = resolvers[ref.module];
  return resolver ? resolver(ref.entityId, householdId) : null;
}
```

### 4.2 Consequence: deletion cleanup must be explicit — Postgres can't cascade an FK it doesn't know exists

Because these pointers aren't real foreign keys, `ON DELETE CASCADE` is not
an option. `plan.md` §3.1 and `ROADMAP.md` §1 both call for *"a generic,
infrastructure-level deletion-cleanup mechanism … implemented once, not
per-module"* for stale `ObjectShare` rows. Implement it as one shared helper,
called explicitly, inside the same `$transaction` as the delete:

```ts
// modules/household/lib/cleanup-object-shares.ts
import type { Prisma } from "@prisma/client";

export async function cleanupObjectSharesFor(
  tx: Prisma.TransactionClient,
  params: { householdId: string; moduleKey: string; objectType: string; objectId: string },
) {
  await tx.objectShare.deleteMany({ where: params });
}
```

```ts
// modules/notes/actions/delete-note.ts
export async function deleteNote(noteId: string) {
  const actingMember = await requireMember();
  await prisma.$transaction(async (tx) => {
    const note = await tx.note.delete({
      where: { id: noteId, householdId: actingMember.householdId },
    });
    await cleanupObjectSharesFor(tx, {
      householdId: actingMember.householdId,
      moduleKey: "notes",
      objectType: "Note",
      objectId: note.id,
    });
  });
}
```

`Reminder`'s graceful-degradation rule follows the identical shape — when a
source entity is deleted, detach rather than cancel:

```ts
// modules/reminders/lib/detach-orphaned-reminders.ts
export async function detachRemindersForDeletedSource(
  tx: Prisma.TransactionClient,
  params: { householdId: string; sourceModule: string; sourceEntityId: string },
) {
  // plan.md §3.3: "converts to standalone manual reminder if source deleted,
  // does not auto-cancel" — never `deleteMany` here.
  await tx.reminder.updateMany({
    where: params,
    data: { sourceType: "manual", sourceModule: null, sourceEntityId: null },
  });
}
```

Every module that owns an entity referenced by `sourceModule`/`sourceEntityId`,
`linkedEntityType`/`linkedEntityId`, or `objectType`/`objectId` elsewhere is
responsible for calling both helpers (as applicable) from its own delete
action — this is a fan-out any new module must wire up per §4.2 of
`AGENTS.md`'s reuse table, not something the schema can enforce for it.

---

## 5. Boundary: what Prisma does not own

Two Supabase-managed pieces sit outside `prisma migrate`'s history entirely —
Prisma only owns the `public` schema:

- **Supabase Auth's `auth.users` table.** `Member.supabaseUserId` (`String`,
  `@unique`, no `@db.Uuid` per §2.6) is a plain scalar pointer to
  `auth.users.id`, with no Prisma `@relation` — the `auth` schema is migrated
  by Supabase, not by us. See `docs/auth.md` §1 for the full linkage and the
  "never store profile fields in `user_metadata`" rule.
  > **Cross-doc note:** `docs/auth.md` names this field `supabaseUserId`;
  > `docs/access-control.md` names the same field `authUserId`
  > (`prisma.member.findUnique({ where: { authUserId: user.id } })`). Pick
  > one before `Member` is committed to the schema — this doc uses
  > `supabaseUserId` since `docs/auth.md` is where the field is defined in
  > depth, but either is a one-line fix in the other doc if the harness
  > reconciliation goes the other way.
- **Supabase Storage.** `Document.fileRef` (Life Admin) and
  `Transaction.attachment` (Finance, reusing `Document`) are plain string
  paths/keys into a Storage bucket, not a Prisma-modeled relation — Storage
  objects aren't Postgres rows Prisma migrates.

---

## 6. The shared Prisma singleton — import path

Three different paths currently appear across harness docs for "the Prisma
client singleton": `AGENTS.md` → `shared/lib/prisma.ts`; `docs/auth.md` →
`@/lib/prisma`; `docs/access-control.md` → `@/lib/db` (used across ten call
sites — the heaviest, most consistent usage of the three). **This doc adopts
`lib/db.ts`, imported as `@/lib/db`**, wrapped with the tenant-guard extension
from §3.2:

```ts
import { prisma } from "@/lib/db";
```

Reconcile `AGENTS.md` and `docs/auth.md` to this path in the same pass that
updates their (and `CLAUDE.md`'s, and `access-control.md`'s) stale
`docs/orm-conventions.md` references to this file's real name, per the resolution
at the top of this document — three conventions for one file is strictly
worse than any single one of them.

---

## 7. Migration workflow

### 7.1 Local dev loop

```bash
# after editing prisma/schema.prisma
pnpm prisma format                        # canonical formatting
pnpm prisma validate                      # schema-level sanity check
pnpm prisma migrate dev --name add_renewal_reminder_offsets
# ^ creates prisma/migrations/<timestamp>_add_renewal_reminder_offsets/migration.sql,
#   applies it to the dev database, regenerates the Prisma Client
```

> **Non-interactive environment fallback.** `prisma migrate dev` refuses to
> run at all ("environment is non-interactive") in a shell that can't answer
> its confirmation prompts (some sandboxed/agent shells, some CI runners) —
> even with `--create-only`. When that happens and you know the change is
> safe (e.g. an empty dev database, or a column that's genuinely additive):
> hand-create `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` with
> the SQL yourself (`date -u +%Y%m%d%H%M%S` for a timestamp matching Prisma's
> own convention), then `pnpm prisma migrate deploy` (which only applies
> already-written migrations and never prompts) followed by `pnpm prisma
> generate`. Only do this when you're certain of the SQL and the target data
> — `migrate dev`'s interactive warnings exist precisely to catch the cases
> where you aren't.

`prisma generate` also runs automatically after `migrate dev`; it additionally
runs in `postinstall` so a fresh `pnpm install` (CI, a new machine, Vercel's
build) always has an up-to-date client:

```json
// package.json (excerpt)
{
  "scripts": {
    "postinstall": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

### 7.2 `DATABASE_URL` vs `DIRECT_URL` — Supabase's pooler

Already established in `docs/auth.md` §2.2 — reused verbatim here since it's
exactly this doc's concern too:

```bash
# .env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // pooled (6543, pgbouncer) — the running app
  directUrl = env("DIRECT_URL")   // direct (5432) — `prisma migrate`/`db push`/`studio` only
}
```

Next.js Server Actions/Route Handlers are short-lived serverless functions on
Vercel — they need the pooled connection. `prisma migrate`/`db push`/`studio`
need a direct connection because pgbouncer's transaction-pooling mode doesn't
support the session-level features migrations rely on (prepared statements,
advisory locks). Never point `DIRECT_URL` at the pooler or `DATABASE_URL` at
the direct port.

### 7.3 CI/CD

`prisma migrate dev` is interactive/dev-only — never run it in CI. Deploys
run `migrate deploy`, which only applies already-committed migration files
and never generates new ones:

```bash
# CI/CD, before pnpm build
pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm prisma generate
pnpm build
```

If a migration was hand-edited (§3.3's partial-index case), `migrate deploy`
still just replays the SQL file verbatim — there's nothing special to do
differently for those in CI.

### 7.4 Seeding: platform catalog vs. per-household grants

Two different seed operations, at two different times, seeding two different
tiers of data (§3's scoped/global distinction again):

- **`prisma/seed.ts`** (`pnpm prisma db seed`) — runs once per environment,
  seeds **global, non-household-scoped** platform-catalog rows: one `Module`
  row per built-in module (`dashboard`, `tasks`, `kanban`, `calendar`,
  `reminders`, `notes`, `finance`, `life_admin` — the eight `plan.md` §1
  names as its "first citizens"), their `ModuleEventType` rows, their
  `ModulePermissionDeclaration` rows, their `ModuleSurfaceRegistration` rows,
  and default starter `Category` rows. Always an **upsert keyed by the
  natural business key** (`Module.key`, `ModuleEventType.key`), never a blind
  `createMany` — re-running the seed against an existing environment (e.g.
  after a 9th module adds new catalog rows) must be safe.

  ```ts
  // prisma/seed.ts
  import { PrismaClient } from "@prisma/client";
  const prisma = new PrismaClient();

  const BUILT_IN_MODULES = [
    { key: "dashboard", name: "Dashboard" },
    { key: "tasks", name: "Tasks" },
    { key: "kanban", name: "Kanban" },
    { key: "calendar", name: "Calendar" },
    { key: "reminders", name: "Reminders" },
    { key: "notes", name: "Notes" },
    { key: "finance", name: "Finance" },
    { key: "life_admin", name: "Life Admin" },
  ] as const;

  async function main() {
    for (const mod of BUILT_IN_MODULES) {
      await prisma.module.upsert({
        where: { key: mod.key },
        update: { name: mod.name },
        create: { key: mod.key, name: mod.name, kind: "built_in", status: "active", version: "1.0.0" },
      });
    }
    // ModuleEventType / ModulePermissionDeclaration / ModuleSurfaceRegistration
    // rows follow the same upsert-by-key pattern, split per module under
    // prisma/seed/ if this file grows unwieldy.
  }

  main().finally(() => prisma.$disconnect());
  ```

- **`seedModuleGrantsForHousehold()`** (already defined in
  `docs/access-control.md` §7.1) — runs **once per household**, inside the
  same transaction that creates it, seeding **household-scoped** `ModuleGrant`
  rows: `granted` automatically for every `isRequired` declaration of a
  `built_in` module (*"all 8 apps work immediately with zero setup,"*
  `plan.md` §7), `pending_review` for everything else. This doc doesn't
  redefine that function — see `docs/access-control.md` §7.1 for the
  implementation, and call it from the household-creation Server Action, not
  from `prisma/seed.ts` (it needs a `householdId` that doesn't exist yet at
  seed time).

---

## 8. The Prisma schema is the source of truth

- Every schema change starts by editing `prisma/schema.prisma` — never by
  hand-writing a migration's SQL first (the one exception is §3.3's partial
  unique index, and even that starts from a Prisma-generated migration file
  via `--create-only`, then gets a documented hand-edit).
- No separate hand-maintained ERD or data-dictionary document.
  `prisma/schema.prisma` plus the generated `@prisma/client` types *are* the
  data dictionary. This doc governs *how* the schema is written; `plan.md`
  governs *what* fields exist; neither duplicates the other's job.
- Never hand-declare a TypeScript interface for a persisted entity. Import
  `Task`, `Household`, `Reminder`, etc. from `@prisma/client` — a
  hand-written duplicate of a Prisma model's shape is a code-review
  rejection, since it silently drifts the moment the schema changes and the
  duplicate doesn't.
- `pnpm prisma format` and `pnpm prisma validate` are part of the checklist
  in `CLAUDE.md`'s "Before You're Done" section whenever a change touches
  `prisma/schema.prisma` — run both before opening a PR, not just `migrate dev`.
- If `plan.md` and the schema ever disagree post-implementation, the schema
  wins for "what the database actually does today" — but that's a signal to
  fix `plan.md` (or record a new decision in it) in the same change, per
  `ROADMAP.md`'s own rule that "scope changes flow through `plan.md` first."
  A schema change that contradicts a **locked** `plan.md` decision (single
  assignee, no multi-currency, fixed 3-role enum, …) requires that decision
  to be revisited in `plan.md` explicitly — never silently patched around at
  the Prisma layer because "the enum was inconvenient."
- `MonthlySummary` and `MemberBalance` are intentionally **not** Prisma
  models. `plan.md` §3.4 calls them "computed views … not necessarily stored
  tables"; `ROADMAP.md` §4 is explicit that they're "implemented as Prisma
  raw queries or Postgres views, not a duplicated write-path table." Default
  implementation: plain server-side aggregation functions (e.g.
  `src/modules/finance/queries/get-monthly-summary.ts`) built on
  `prisma.transaction.groupBy(...)`. If/when performance demands a real
  materialized view, Prisma's `previewFeatures = ["views"]` + `view` keyword
  is the escape hatch — that's an explicit, deliberate schema change (add the
  `view` block, `prisma db pull` to introspect it), not the V1 default.

---

## 9. Checklist: adding a new model

1. Confirm it isn't already covered by an existing shared capability
   (`Reminder`, `Notification`, `visibility`/`ObjectShare`, `Document`) — see
   `AGENTS.md` §2 Step 0's reuse table.
2. Add the model under the correct section banner in `prisma/schema.prisma`
   (§1.1), in the plan's own field order, using the plan's exact field names
   (§2.2–§2.3).
3. `householdId String` + `@@index([householdId])`, even if it's derivable
   from a parent relation (§3.1) — unless the model is one of the five
   platform-catalog globals (§2.1's table).
4. `id String @id @default(cuid())`, `createdAt`/`updatedAt` (§2.2, §2.6).
5. Any FK to `Member`: apply the scalar/relation naming rule in §2.3.
6. Any FK to "some entity in another module, decided per-row": plain scalar
   pointer fields, no `@relation`, per §4 — and write its resolver entry in
   `src/lib/module-registry/resolve-source-entity.ts` if it's a `sourceModule` /
   `linkedEntityModule` style pointer.
7. Add it to `TENANT_SCOPED_MODELS` in `lib/db/tenant-guard.ts` (§3.2) in the
   same PR — the guard is only as good as this list staying current.
8. If the model has a `visibility` column, add its `ownerField`/`moduleKey`/
   `objectType` row to `docs/access-control.md` §5.2's table in the same PR.
9. If deleting a row of this model needs to clean up `ObjectShare` rows or
   detach `Reminder`s pointing at it, wire the §4.2 helpers into its delete
   action.
10. `pnpm prisma format && pnpm prisma validate && pnpm prisma migrate dev --name <change>`.
11. Update `ROADMAP.md`'s checklist for the owning module section (per
    `ROADMAP.md`'s own "how to keep this file honest" rules).
