# CLAUDE.md

Instructions for Claude Code (or any coding agent) working in this repository.

## What This Repo Is

Home OS is a personal "home operating system" for a household — tasks, kanban,
calendar, reminders, notes, finance, and life-admin records, all connected,
shared between household members, built as a single Next.js 15 app on
Postgres/Prisma/Supabase. See [README.md](./README.md) for the product pitch
and [plan.md](./plan.md) for the full, approved spec (every entity, every
field, every V1/V2 scope decision — it is the source of truth; nothing in
this file overrides it).

**Right now this repo is a harness, not a product.** There is no
product-specific feature code yet — only this documentation. Your job, task
by task, is to implement Home OS's modules on top of the conventions
documented here and in `docs/`. Follow the existing pattern of the first
module you touch (or the closest already-built one) before inventing a new
one; if two docs genuinely conflict, `plan.md` wins on *what* to build, and
the most specific `docs/*.md` file wins on *how* to build it.

## Where To Look

| Doc | What it covers |
|---|---|
| [plan.md](./plan.md) | Entities, fields, modules, V1 vs V2 scope — the product spec |
| [ROADMAP.md](./ROADMAP.md) | Build order — which module is next, what's already shipped |
| [AGENTS.md](./AGENTS.md) | Project/folder structure, and the step-by-step checklist for building a new (9th+) platform module |
| `docs/project-structure.md` | Deeper detail on folder layout and naming than the summary in AGENTS.md |
| `docs/module-architecture.md` | The `Module`/`ModuleEventType`/`EventSubscription`/`ModulePermissionDeclaration`/`ModuleGrant`/`ModuleSurfaceRegistration` registration pattern every module (built-in or custom) follows |
| `docs/orm-conventions.md` | Prisma conventions: single-file schema (`prisma/schema.prisma`), `householdId` scoping, enums, soft-delete/archive fields, migration naming |
| `docs/resources.md` | Step-by-step convention for registering a new entity end-to-end (Prisma model → data-access layer → server actions → UI → tests) |
| `docs/seeding.md` | Seed script conventions — a seeded household, sample data across all 8 modules, and the platform-catalog seed |
| `docs/auth.md` | Supabase Auth session handling, `requireMember()`/`requireRole()` helpers, how `Member.role` gates server actions |
| `docs/forms.md` | Server Action + `react-hook-form` + `zod` conventions for every mutation |
| `docs/tables.md` | Data table conventions (sorting/filtering/pagination) and row-action dialog patterns |
| `docs/access-control.md` | How to implement the `visibility`/`ObjectShare` contract on a new entity, including the query pattern |
| `docs/email.md` | `Reminder`/`Notification`/`NotificationPreference`/`DigestSubscription` + Resend integration conventions |
| `docs/upload.md` | Supabase Storage conventions for `Document` uploads (bucket structure, size/type limits, visibility-gated access) |
| `docs/ui-components.md` | Tailwind + shadcn/ui conventions (no Storybook in V1 — see README) |
| `docs/recipes.md` | Worked "how do I..." examples: role-gated actions/routes, creating a `Reminder` from another module, subscribing to a `ModuleEventType` |
| `docs/toolkit.md` | Internal helper scripts (seeding, module scaffolding) and how they're wired into `package.json` |
| `docs/testing.md` | Vitest/Playwright conventions, what must be covered, where tests live |
| `docs/verify.md` | The exact commands that must pass before a change is "done" (summarized below) |

If a task references a `docs/*.md` file that doesn't exist yet, that's a gap
in the harness, not permission to skip the convention — write the doc as
part of your change, following the shape of the others, then follow it.

## Non-Negotiable Rules

These hold for every module, every entity, every PR — no exceptions without
an explicit decision recorded in `plan.md`.

### 1. Every query scopes data by `householdId`

Home OS is multi-tenant with **no cross-household data sharing of any kind**
(plan.md §2.1). Every Prisma model that isn't platform-catalog data
(`Module`, `ModuleEventType`, `EventSubscription`, `ModulePermissionDeclaration`,
`ModuleSurfaceRegistration`) carries `householdId`, and every single query
against it — read or write — filters on the current household. Never trust
an object id alone to imply the household; always include `householdId` in
the `where`, even when it looks redundant:

```ts
// src/modules/tasks/queries/get-task.ts
export async function getTask(householdId: string, taskId: string) {
  return prisma.task.findFirstOrThrow({
    where: { id: taskId, householdId }, // both, always — not just id
  })
}
```

See `docs/orm-conventions.md` for the Prisma-level conventions and
`docs/auth.md` for where `householdId` comes from in a request (it's derived
from the authenticated Member's session, never taken from a client-supplied
param).

### 2. Every shareable entity uses the `visibility` / `ObjectShare` pattern

Any entity a member might want to keep private, share with the whole
household, or share with specific people uses the single platform-wide
contract from plan.md §3.1 — a `visibility` enum
(`private | household | specific_members`) plus the generic `ObjectShare`
join table keyed by `(householdId, moduleKey, objectType, objectId,
sharedWithMemberId)`. Do not add a per-entity `sharedWith` field or a
module-specific grantee table:

```ts
// src/modules/tasks/queries/get-visible-tasks.ts
export async function getVisibleTasks(householdId: string, memberId: string) {
  const shares = await prisma.objectShare.findMany({
    where: { householdId, moduleKey: 'tasks', objectType: 'Task', sharedWithMemberId: memberId },
    select: { objectId: true },
  })

  return prisma.task.findMany({
    where: {
      householdId,
      OR: [
        { visibility: 'household' },
        { visibility: 'private', createdById: memberId },
        { visibility: 'specific_members', id: { in: shares.map((s) => s.objectId) } },
      ],
    },
  })
}
```

`private` has **no** admin/owner override, ever (plan.md §9). Full pattern,
including the deletion-cleanup mechanism for stale `ObjectShare` rows, lives
in `docs/access-control.md`.

### 3. Every new module follows the platform registration pattern

Any module — one of the original 8 or a 9th+ added later — is a set of rows
in the platform registries (`Module`, `ModuleEventType`,
`ModulePermissionDeclaration`, `ModuleSurfaceRegistration`, plus
`EventSubscription` for anything it reacts to), never bespoke wiring into
Dashboard/Search/Nav/another module's code. The exact registration steps,
required fields, and the graceful-degradation contract are in
[AGENTS.md](./AGENTS.md) and `docs/module-architecture.md` — follow them
verbatim; don't hand-roll a lighter version "since it's just one module."

### 4. Tests are written alongside features, not after

A feature and its tests land in the same change. Colocate unit/integration
tests next to the code (`src/modules/tasks/actions/complete-task.ts` →
`src/modules/tasks/actions/complete-task.test.ts`); cross-module flows get a
Playwright spec under `e2e/`. See `docs/testing.md` for what counts as
adequate coverage per change (e.g. every Server Action needs at least one
test for the happy path and one for a rejected/unauthorized path).

### 5. The harness is a living document — fix drift in the same change

If implementing something reveals that a `docs/*.md` file, `AGENTS.md`, or
this file is now wrong, incomplete, or contradicts another doc (a renamed
helper, a folder that moved, a convention that turned out not to fit),
correct the doc as part of the same change — don't leave it for later and
don't silently code around the discrepancy. Check `ROADMAP.md`'s checklist
for the entity/feature you just touched and tick it off (or add it, if the
plan named something ROADMAP.md doesn't yet list). A harness that quietly
drifts out of sync with the real codebase is worse than no harness — the
next task (human or agent) will trust it and build on the wrong thing.

## Before You're Done — Verification

Every change must pass the full checklist in `docs/verify.md` before it's
considered complete. At minimum, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If the change touched `prisma/schema.prisma`, also run:

```bash
pnpm prisma validate
pnpm prisma migrate dev --name <descriptive_name>
```

Do not report a task as finished if any of the above fail. If a check fails
for a reason unrelated to your change, say so explicitly rather than
silently skipping it.
