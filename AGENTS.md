# AGENTS.md

This is the implementation of plan.md's "Guidance for an agent building a
new app": where code lives in this repo, and exactly how to add a new
platform module. For non-negotiable engineering rules (household scoping,
visibility/sharing, verification), see [CLAUDE.md](./CLAUDE.md). For product
scope and entity fields, see [plan.md](./plan.md).

---

## 1. Project Structure — "where does X go"

```
home-os/
├── src/
│   ├── app/                         # Next.js App Router — ROUTING ONLY, kept thin
│   │   ├── (marketing)/
│   │   │   └── page.tsx             # public landing page (pre-login)
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx    # creates Household + first owner Member
│   │   │   └── invite/[token]/page.tsx  # Invite acceptance flow
│   │   ├── (app)/                   # authenticated household shell
│   │   │   ├── layout.tsx           # loads current Member/Household, renders nav
│   │   │   │                        # from ModuleSurfaceRegistration rows
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── tasks/page.tsx
│   │   │   ├── tasks/[taskId]/page.tsx
│   │   │   ├── kanban/[boardId]/page.tsx
│   │   │   ├── calendar/page.tsx
│   │   │   ├── reminders/page.tsx
│   │   │   ├── notes/page.tsx
│   │   │   ├── notes/[noteId]/page.tsx
│   │   │   ├── finance/page.tsx
│   │   │   ├── finance/subscriptions/page.tsx
│   │   │   ├── life-admin/documents/page.tsx
│   │   │   ├── life-admin/renewals/page.tsx
│   │   │   ├── life-admin/contacts/page.tsx
│   │   │   ├── life-admin/shopping-lists/[listId]/page.tsx
│   │   │   └── settings/
│   │   │       ├── household/page.tsx
│   │   │       ├── members/page.tsx
│   │   │       ├── notifications/page.tsx   # NotificationPreference + DigestSubscription
│   │   │       └── modules/page.tsx         # ModuleGrant review/revoke — the one
│   │   │                                    # end-user-facing extensibility screen
│   │   └── api/
│   │       ├── auth/callback/route.ts       # Supabase Auth callback
│   │       └── cron/                        # paths match vercel.json exactly
│   │           ├── reminders-sweep/route.ts     # fires due ReminderOccurrences
│   │           ├── subscriptions-sweep/route.ts # Subscription renewal-threshold scan
│   │           ├── budgets-sweep/route.ts       # Budget threshold scan
│   │           ├── renewals-sweep/route.ts      # Renewal threshold scan
│   │           └── digests-send/route.ts        # sends DigestSubscription rollups
│   │
│   ├── modules/                     # the 8 product modules from plan.md — one folder
│   │   │                            # per `Module` row, nothing else
│   │   ├── tasks/
│   │   │   ├── actions/
│   │   │   ├── queries/
│   │   │   ├── components/
│   │   │   └── module.ts             # this module's self-description
│   │   ├── kanban/
│   │   ├── calendar/
│   │   ├── reminders/
│   │   ├── notes/
│   │   ├── finance/
│   │   ├── life-admin/
│   │   └── dashboard/                # "Today" cross-module query, search, command palette
│   │                                  # (reads other modules' public queries — see §7)
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives (copied in, customized)
│   │   └── ...                       # cross-module composites (e.g. <EntityShareDialog>)
│   ├── types/
│   │
│   └── lib/                          # platform substrate — Household/Member/ObjectShare,
│       │                              # the module registry, and the event bus are NOT
│       │                              # `Module` rows themselves; they're what the
│       │                              # `Module`/`ModuleGrant` system runs on top of
│       ├── db.ts                      # Prisma client singleton (@/lib/db)
│       ├── supabase/                 # server + browser Supabase clients
│       ├── auth/
│       │   └── session.ts            # requireMember(), requireRole()
│       ├── household/                # Household, Member, Invite, ObjectShare
│       ├── notifications/            # NotificationPreference, DigestSubscription, Notification
│       ├── email/                    # Resend integration + templates
│       ├── events/                   # the event bus runtime (emitEvent(), dispatch)
│       └── module-registry/          # Module, ModuleEventType, EventSubscription,
│                                      # EventOccurrence, ModulePermissionDeclaration,
│                                      # ModuleGrant, ModuleSurfaceRegistration
│
├── prisma/
│   ├── schema.prisma                 # single file — every module's models live here,
│   │                                  # do not split into multiple .prisma files
│   ├── migrations/
│   └── seed.ts                       # seeds default Categories, registers the 8
│                                      # built-in Modules + their registry rows
│
├── e2e/                               # Playwright — cross-module flows only
├── docs/                              # harness conventions (see CLAUDE.md for the index)
├── plan.md
├── ROADMAP.md
├── README.md / CLAUDE.md / AGENTS.md
```

### Quick lookup

| You're building... | It goes in |
|---|---|
| A new page/route | `src/app/(app)/<route>/page.tsx` — thin, imports from `src/modules/<key>` |
| A Server Action (mutation) | `src/modules/<key>/actions/<verb-noun>.ts` |
| A data-fetching function for an RSC | `src/modules/<key>/queries/<get-thing>.ts` |
| A Prisma model | Added to the single `prisma/schema.prisma`, then `pnpm prisma migrate dev` |
| A module-specific UI piece | `src/modules/<key>/components/` |
| A component reused across modules | `src/components/` |
| A shadcn/ui primitive | `pnpm dlx shadcn@latest add <component>` → lands in `src/components/ui/` |
| An event type this module emits | `src/modules/<key>/module.ts` (`ModuleEventType` rows) |
| A reaction to another module's event | `src/modules/<key>/events/subscriptions.ts` (`EventSubscription` rows) |
| A unit/integration test | Colocated `<file>.test.ts` next to the code it tests |
| A cross-module end-to-end test | `e2e/<flow>.spec.ts` |

---

## 2. Building a New Module (9th+) — Step-by-Step Checklist

Per plan.md §7: "a 9th module is added by a developer/agent writing new
`Module` / `ModuleEventType` / `EventSubscription` /
`ModulePermissionDeclaration` / `ModuleSurfaceRegistration` rows through
code, following the same pattern the 8 built-ins already follow — no
special-casing, no changes to existing modules' code." There is no
installer UI in V1 — you *are* the installer.

The example below adds a hypothetical 9th module, `meal-planning`, to show
concrete shapes. Substitute your own module's key/entities throughout. Note
the folder/route name stays kebab-case (`meal-planning`, matching the other
module folders like `life-admin`), while the `Module.key` value itself is
snake_case (`meal_planning`, matching plan.md's `moduleKey` convention, e.g.
`life_admin`).

### Step 0 — Reuse before you build

Before adding a single new entity, check whether an existing platform
capability already does what you need:

| Need | Reuse this | Don't build |
|---|---|---|
| Alert a member at a point in time | `Reminder` + `ReminderOccurrence` (set `sourceModule`/`sourceEntityId`) | A module-specific scheduled-alert table |
| Tell a member something happened, in-app | `Notification` (respects `NotificationPreference`/`categoryKey`) | A module-specific inbox/feed |
| Let an owner mark a record private/shared/shared-with-specific-people | `visibility` enum + `ObjectShare` | A custom permissions/grantee table |
| Attach a file | `Document` (`linkedEntityType`/`linkedEntityId`) | Your own upload/storage table |
| Send an email for something that happened | A `NotificationPreference` `categoryKey` + the shared mailer (Resend), see `docs/email.md` | Direct Resend calls scattered in module code |
| Appear on Dashboard/Search/Palette/Nav | A `ModuleSurfaceRegistration` row | Hardcoded entries in dashboard/search/nav code |

For `meal-planning`, that means: no new alerting system (use `Reminder` to
remind the assigned cook), no new attachment table (use `Document` for
recipe photos), and — since it wants to push ingredients onto a shopping
list — reuse Life Admin's `ShoppingList`/`ShoppingListItem` rather than
inventing its own.

### Step 1 — Scaffold the module folder

```bash
mkdir -p src/modules/meal-planning/{actions,queries,components,events}
```

### Step 2 — Add any genuinely new Prisma models

Only for data no existing entity covers (e.g. `MealPlan`, `Recipe`), added
to the single `prisma/schema.prisma` file alongside every other module's
models:

```prisma
// prisma/schema.prisma — append here, do not create a separate file
model MealPlan {
  id             String     @id @default(cuid())
  householdId    String
  household      Household  @relation(fields: [householdId], references: [id])
  weekOf         DateTime
  visibility     Visibility @default(household)
  createdById    String
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([householdId])
}
```

```bash
pnpm prisma migrate dev --name add_meal_planning
```

### Step 3 — Register the `Module` row

```ts
// src/modules/meal-planning/module.ts
export const moduleRegistration = {
  key: 'meal_planning',
  name: 'Meal Planning',
  description: 'Plan weekly meals and push ingredients onto a shopping list.',
  version: '1.0.0',
  kind: 'custom' as const,          // 9th+ modules are always 'custom', never 'built_in'
  dependsOnModules: ['tasks', 'life_admin', 'reminders'], // soft deps
  status: 'active' as const,        // platform-wide catalog status
}
```

### Step 4 — Declare its `ModuleEventType`s

```ts
// src/modules/meal-planning/module.ts (continued)
export const eventTypes = [
  {
    owningModule: 'meal_planning',
    key: 'meal_planning.plan_published',
    label: 'Weekly meal plan published',
    payloadSummary: '{ planId, weekOf, memberIds[] }',
    contractVersion: 1,
    relatedEntityType: 'MealPlan',
  },
]
```

Other modules subscribe by referencing `meal_planning.plan_published` only —
never meal-planning's internals.

### Step 5 — Declare its `ModulePermissionDeclaration`s

```ts
export const permissionDeclarations = [
  { resourceDomain: 'reminders',  accessLevel: 'write', purpose: 'Remind the assigned cook before meal time', isRequired: true },
  { resourceDomain: 'life_admin', accessLevel: 'write', purpose: 'Push recipe ingredients onto a ShoppingList', isRequired: false },
  { resourceDomain: 'tasks',      accessLevel: 'write', purpose: 'Create a prep task for elaborate recipes', isRequired: false },
]
```

`isRequired: false` means meal-planning must still function, minus that one
feature, if the household hasn't granted (or has revoked) that permission.

### Step 6 — Understand `ModuleGrant` — no auto-grant for custom modules

Because `kind: 'custom'`, none of these permissions are pre-seeded as
`granted` the way the 8 built-ins are. Every required declaration starts
`pending_review`; a household owner/admin must approve it under
**Settings → Modules** (`src/app/(app)/settings/modules/page.tsx`) before the
module can act on that permission for that household. Your code must check
this, not assume it:

```ts
// src/modules/meal-planning/actions/schedule-cook-reminder.ts
const grant = await getModuleGrant(householdId, 'meal_planning', 'reminders')
if (grant?.status !== 'granted') {
  throw new ModuleNotGrantedError(
    'meal-planning needs Reminders access — ask a household owner/admin ' +
    'to approve it under Settings → Modules.'
  )
}
```

### Step 7 — Declare its `ModuleSurfaceRegistration`s

```ts
export const surfaceRegistrations = [
  { surface: 'navigation_item',       label: 'Meal Planning',        target: '/meal-planning',                     sortOrder: 90, enabled: true },
  { surface: 'dashboard_widget',      label: "This Week's Meals",    target: 'meal-planning/widgets/week-at-a-glance', sortOrder: 50, enabled: true },
  { surface: 'quick_capture_target',  label: 'Add a recipe idea',    target: 'meal-planning/quick-capture',        sortOrder: 40, enabled: true },
  { surface: 'global_search_provider',label: 'Recipes & meal plans', target: 'meal-planning/search',               sortOrder: 60, enabled: true },
]
```

This is the *only* thing that makes meal-planning show up on the dashboard,
in search, and in nav — zero changes to `src/modules/dashboard/` code.

### Step 8 — Subscribe to events from other modules, if relevant

```ts
// src/modules/meal-planning/events/subscriptions.ts
export const subscriptions = [
  {
    subscriberModule: 'meal_planning',
    eventType: 'task.completed',
    reactionDescription:
      'If the completed task was a meal-prep task this module created, mark that meal as prepped.',
    onFailure: 'log_only' as const,
  },
]
```

### Step 9 — Fail gracefully if a dependency is missing or disabled

Check `Module.status`/`healthStatus` before relying on an optional
dependency — never let a missing/disabled module throw an unhandled error:

```ts
// src/modules/meal-planning/actions/publish-plan.ts
const lifeAdmin = await getModuleHealth('life_admin')

if (lifeAdmin?.status !== 'active' || lifeAdmin.healthStatus !== 'ok') {
  // degrade: skip auto-adding to ShoppingList; the plan still saves and
  // the member can copy ingredients over manually
} else {
  await addItemsToShoppingList(householdId, plan.shoppingListId, ingredients)
}
```

This mirrors the built-in contract from plan.md §7: e.g. if Kanban is
disabled, `Task.boardId`/`columnId` simply stop resolving/rendering rather
than erroring; re-enabling restores full function with no data loss.

### Step 10 — Tests and verification

Write `src/modules/meal-planning/actions/publish-plan.test.ts` alongside
`publish-plan.ts` (see `docs/testing.md`), then run the full checklist from
`docs/verify.md` / [CLAUDE.md](./CLAUDE.md) before calling the module done:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

## 3. The Five Platform Principles, as an Agent Checklist

Restated from README.md's "Extensibility" section as concrete steps (see
plan.md §7 for the full architectural rationale):

1. **First-class citizen** → Steps 3–7 above; never hand-edit
   Dashboard/Search/Nav/another module's code to "plug in."
2. **Build on what exists** → Step 0's reuse table; lean on `Reminder`,
   `Notification`, `ObjectShare`/`visibility`, `Document`, and
   `Household`/`Member` identity rather than rebuilding any of them.
3. **Cooperate without knowing about each other** → Steps 4 and 8; react to
   `ModuleEventType` keys, never to another module's internals or tables.
4. **Be a good platform citizen yourself** → once your module ships, its own
   `ModuleEventType`/`ModulePermissionDeclaration`/`ModuleSurfaceRegistration`
   rows are a contract others may depend on; bump `contractVersion` only on
   breaking changes, and keep working if one of *your* optional dependencies
   disappears.
5. **Household stays in control** → Step 6; every access your module has was
   explicitly granted (or pre-seeded only if built-in) and can be revoked at
   any time — code defensively for the revoked case, not just the granted one.
