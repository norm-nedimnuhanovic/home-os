# Access Control

This doc is the single source of truth for **who can do what** in Home OS. It
covers three layers that every Server Action, Route Handler, and Server
Component must go through, in this order:

1. **Authentication** — is there a signed-in Supabase user at all? (`middleware.ts`,
   redirect-only, no business logic.)
2. **MemberRole authorization** — is the acting `Member`'s `role` (owner/admin/member)
   allowed to perform *this action*? (`lib/access/roles.ts`,
   `lib/access/household-permissions.ts`.)
3. **Visibility scoping** — of the rows this action reads/writes, which ones is
   the acting `Member` actually allowed to see, per the plan's
   `private | household | specific_members` contract? (`lib/access/visibility.ts`.)

Layer 2 and layer 3 are independent and both apply, always. A `member` can be
*allowed* to run `listTasks()` (role check passes — everyone can list tasks)
while still only getting back the subset of `Task` rows their visibility
permits (visibility check narrows the result set). Never conflate "can call
this action" with "can see this row" — they are different functions, called
separately, documented separately below.

A fourth, unrelated category — **data-integrity guards** (e.g. "a `Transaction`
with settled `TransactionSplit`s cannot be edited or voided until the
`Settlement` is undone") — is *not* access control. Those checks live next to
the entity's business logic (e.g. `src/modules/finance/transactions/actions.ts`),
not in `lib/access/`. Don't blend the two: a data-integrity guard fails for
every role including the owner; an access-control guard is about *who* the
acting member is.

> Companion docs: `docs/orm-conventions.md` (full Prisma schema, entity field
> reference), `docs/module-architecture.md` (Module / ModuleEventType / EventOccurrence
> mechanics), `docs/testing.md` (test runner setup and conventions). The
> `ActionResult<T>` return-shape convention this doc's Server Action examples
> use (`{ success: true, data } | { success: false, error }`, with
> `ForbiddenError` caught and mapped to the `error` branch) lives in
> `src/lib/access/errors.ts` — small enough not to need its own doc.

---

## 1. Non-goals — read this before adding a check anywhere else

- **No Postgres Row-Level Security in V1.** Supabase gives us Postgres +
  Auth + Storage, but Prisma connects with a direct, trusted server-side
  connection string. Enforcement happens in the application layer
  (`lib/access/*`), not in RLS policies. Don't add `ALTER TABLE ... ENABLE ROW
  LEVEL SECURITY` migrations expecting them to be the enforcement point —
  they aren't, and none currently exist.
- **No authorization logic in `middleware.ts`.** Middleware only checks "is
  there a valid Supabase session" and redirects to `/login` if not. It cannot
  cheaply load the acting `Member` row (role, household, status) on every
  request, so it must never special-case a route by role. Every real
  authorization decision happens inside the Server Action / Route Handler /
  Server Component that actually touches Prisma.
- **No client-side-only checks.** Hiding an "Invite member" button for a
  `member`-role user in the UI is a UX nicety, never the enforcement. The
  Server Action re-checks `canInviteMember()` regardless of what the client
  sent. Assume every Server Action can be called directly with crafted
  arguments.
- **No trusting client-supplied identity.** A form field, hidden input, or
  query param must never be the source of `memberId`, `householdId`, or
  `role` for an authorization decision — those always come from
  `requireMember()` (§2), which derives them server-side from the Supabase
  session on every call.

---

## 2. Resolving the acting member

Every module needs one thing before it does anything else: the `Member` row
behind the current request. That resolution lives in one place.

**This function is not redefined here.** `docs/auth.md` §6 owns the one
`requireMember()` implementation, at `@/lib/auth/session` — access-control
only builds authorization on top of what it returns. Two earlier drafts of
this doc and `docs/auth.md` each sketched their own version (one redirecting
on failure, one returning `null`); `docs/auth.md`'s nullable-returning
version is the one that actually ships, so every call site below follows its
pattern: call `requireMember()`, then explicitly `redirect()` if it comes
back `null` — never assume a non-null return.

```ts
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";

// ActingMember is just the shape requireMember() resolves to — not a
// separately maintained type, so it can never drift from the real function.
export type ActingMember = NonNullable<Awaited<ReturnType<typeof requireMember>>>;
```

> **Harness note on `supabaseUserId`.** The product plan intentionally leaves
> platform Auth (login/session/credential mechanics) out of scope — see
> plan.md: *"A platform Auth capability ... is assumed to exist alongside
> these shared capabilities but is out of scope for the product plan itself
> (it's a harness/implementation concern)."* This doc is that harness
> concern. `Member.supabaseUserId` (`text`, unique, not null after signup
> completes, FK-equivalent to Supabase's `auth.users.id`) is the one field
> this harness adds beyond the plan's entity digest specifically to make
> `requireMember()` possible. Add it to the `Member` model in
> `prisma/schema.prisma` alongside the fields listed in `docs/orm-conventions.md`
> when that model is built.

Route Handlers use the exact same function — there is no separate
authorization path for `app/api/**/route.ts` vs. Server Actions:

```ts
// app/api/tasks/route.ts
import { requireMember } from "@/lib/auth/session";
import { listTasks } from "@/modules/tasks/queries";

export async function GET(request: Request) {
  const actingMember = await requireMember();
  const tasks = await listTasks(actingMember, parseTaskFilters(request.url));
  return Response.json(tasks);
}
```

---

## 3. The role model

```prisma
// prisma/schema.prisma (excerpt — see docs/orm-conventions.md for the full Member model)
enum MemberRole {
  owner
  admin
  member
}

enum MemberStatus {
  active
  suspended
  removed
}
```

The plan locks a **fixed 3-role enum for V1 — no `CustomRole`.** MemberRole checks
are therefore plain rank comparisons, not a permission-matrix lookup:

```ts
// lib/access/roles.ts
import type { MemberRole } from "@prisma/client";

export const ROLE_RANK: Record<MemberRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/** True if actingRole is at least as privileged as minimumRole. */
export function hasAtLeastRole(actingRole: MemberRole, minimumRole: MemberRole): boolean {
  return ROLE_RANK[actingRole] >= ROLE_RANK[minimumRole];
}
```

`hasAtLeastRole` covers every check that's a simple hierarchy ("admin or
higher can do X"). It does **not** cover the handful of rules from the plan
that are asymmetric rather than hierarchical — those get their own named
function so the special case is visible at the call site instead of buried in
an `if`:

| Rule (from plan.md) | Why it isn't a plain rank check |
|---|---|
| "admins cannot remove other admins (owner-only)" | An admin outranks a member but *cannot* act on an equal-or-higher peer — rank alone would wrongly allow admin→admin |
| "household always has ≥1 owner" | Depends on a COUNT query against the household's other members, not on the acting member's role at all |
| Owner "remove anyone incl. admins" | Confirms owner has no target-role restriction — needs stating explicitly, not inferred |

### 3.1 Capability table

Every one of these is a small, named, pure(-ish) function in
`lib/access/household-permissions.ts`. Server Actions call the function by
name — they never inline `actingMember.role === "owner"` checks.

| Ability | member | admin | owner | Function |
|---|---|---|---|---|
| Create/edit/delete their own objects (Task, Note, …) | yes | yes | yes | ownership check inline at the entity, see §4.3 |
| Read data per visibility rules | yes | yes | yes | `visibilityWhere()`, §5 — not role-gated |
| Send an `Invite` (role must be `admin` or `member` on the invite itself) | no | yes | yes | `canInviteMember()` |
| Remove a member with `role: "member"` | no | yes | yes | `canRemoveMember()` |
| Remove a member with `role: "admin"` | no | no | yes | `canRemoveMember()` |
| Remove a member with `role: "owner"` | no | no | yes, if not the last owner | `canRemoveMember()` + `assertNotLastOwner()` |
| Promote a `member` to `admin` | no | yes | yes | `canChangeMemberRole()` |
| Demote/change an `admin`'s or `owner`'s role | no | no | yes, if not the last owner | `canChangeMemberRole()` + `assertNotLastOwner()` |
| Moderate sharing (force-revoke another member's `ObjectShare`) | no | yes | yes | `canModerateSharing()` |
| Close the household | no | no | yes | `canCloseHousehold()` |
| Transfer ownership | no | no | yes | `canTransferOwnership()` |
| Review/grant/revoke an optional `ModuleGrant` | no | yes | yes | `canManageModuleGrant()`, §7 |
| Revoke a **required** `ModuleGrant` (risks breaking a built-in module) | no | no | yes | `canManageModuleGrant()` + `isRequired` check, §7 |

The "promote a member to admin" and "demote an admin/owner" rows aren't
spelled out in plan.md (it only states the removal rule). This harness
extends the same owner-only-touches-admins-and-owners shape to role changes
for consistency — call this out explicitly if the product plan is amended
later to say otherwise.

```ts
// lib/access/household-permissions.ts
import type { MemberRole } from "@prisma/client";
import { hasAtLeastRole } from "./roles";
import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";
import { ForbiddenError } from "./errors";

export function canInviteMember(actingMember: ActingMember): boolean {
  return hasAtLeastRole(actingMember.role, "admin");
}

export function canRemoveMember(
  actingMember: ActingMember,
  targetMember: { role: MemberRole },
): boolean {
  if (actingMember.role === "owner") return true;
  if (actingMember.role === "admin") return targetMember.role === "member";
  return false;
}

export function canChangeMemberRole(
  actingMember: ActingMember,
  targetMember: { role: MemberRole },
  nextRole: MemberRole,
): boolean {
  if (actingMember.role === "owner") return true;
  if (actingMember.role === "admin") {
    // admins may only promote a plain member — never touch an existing
    // admin's or owner's role, mirroring the removal rule above
    return targetMember.role === "member" && nextRole === "admin";
  }
  return false;
}

export function canModerateSharing(actingMember: ActingMember): boolean {
  return hasAtLeastRole(actingMember.role, "admin");
}

export function canCloseHousehold(actingMember: ActingMember): boolean {
  return actingMember.role === "owner";
}

export function canTransferOwnership(actingMember: ActingMember): boolean {
  return actingMember.role === "owner";
}

/**
 * Enforces "household always has ≥1 owner". Call before removing a member
 * or changing a member's role away from "owner". Pass the id of the member
 * being removed/demoted so they're excluded from the remaining count.
 */
export async function assertNotLastOwner(householdId: string, excludingMemberId: string) {
  const remainingOwners = await prisma.member.count({
    where: {
      householdId,
      role: "owner",
      status: "active",
      id: { not: excludingMemberId },
    },
  });
  if (remainingOwners === 0) {
    throw new ForbiddenError("A household must always have at least one owner.");
  }
}
```

---

## 4. The Server Action convention

Every mutating Server Action follows the same shape, in this order:

1. Resolve `actingMember` via `requireMember()` — never accept it as an argument.
2. Load the target row(s), scoped by `householdId: actingMember.householdId`
   (tenant isolation — see §6) *before* checking anything else about them.
3. Run the role/capability check. Throw `ForbiddenError` (caught at the
   Server Action boundary — see `src/lib/access/errors.ts` for the
   `ActionResult<T>` shape) if it fails.
4. Only then read/write.

### 4.1 Example — invite a member (`admin` or `owner` only)

```ts
// app/(app)/members/actions.ts
"use server";

import { requireMember } from "@/lib/auth/session";
import { canInviteMember } from "@/lib/access/household-permissions";
import { ForbiddenError } from "@/lib/access/errors";
import { prisma } from "@/lib/db";
import { randomBytes } from "node:crypto";

export async function inviteMember(input: { email: string; role: "admin" | "member" }) {
  const actingMember = await requireMember();

  if (!canInviteMember(actingMember)) {
    throw new ForbiddenError("Only an admin or owner can invite a new member.");
  }

  return prisma.invite.create({
    data: {
      householdId: actingMember.householdId,
      email: input.email,
      role: input.role,
      invitedByMember: actingMember.id,
      token: randomBytes(32).toString("hex"),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default
    },
  });
}
```

### 4.2 Example — remove a member (owner-only when target is an admin)

This is the canonical example of an *asymmetric* rule: it isn't "role ≥ X",
it depends on the *target's* role too, and it must re-check the last-owner
invariant.

```ts
// app/(app)/members/actions.ts
"use server";

import { requireMember } from "@/lib/auth/session";
import { canRemoveMember, assertNotLastOwner } from "@/lib/access/household-permissions";
import { ForbiddenError } from "@/lib/access/errors";
import { prisma } from "@/lib/db";

export async function removeMember(targetMemberId: string) {
  const actingMember = await requireMember();

  // Always re-scope the lookup by householdId — Member.email is unique per
  // household, not globally, so a memberId from another household must
  // resolve to nothing here, never leak whether it exists elsewhere.
  const targetMember = await prisma.member.findFirst({
    where: { id: targetMemberId, householdId: actingMember.householdId },
  });
  if (!targetMember) {
    throw new ForbiddenError("Member not found in this household.");
  }

  if (!canRemoveMember(actingMember, targetMember)) {
    throw new ForbiddenError("Only the owner can remove an admin.");
  }

  if (targetMember.role === "owner") {
    await assertNotLastOwner(actingMember.householdId, targetMember.id);
  }

  // Plan: "removed members' owned objects stay attributed to them, not
  // reassigned/deleted" — this is a status flip only, never a delete/reassign.
  return prisma.member.update({
    where: { id: targetMember.id },
    data: { status: "removed" },
  });
}
```

### 4.3 Ownership checks for "manage your own data"

The plan gives `member` the ability to "manage own data + assigned items."
That's *not* a role-rank check — it's "is `actingMember.id` the owner of (or
assignee on) this specific row," checked against the row itself, independent
of role:

```ts
// modules/tasks/actions.ts
"use server";

import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { prisma } from "@/lib/db";

export async function updateTask(taskId: string, input: TaskUpdateInput) {
  const actingMember = await requireMember();

  const task = await prisma.task.findFirst({
    where: { id: taskId, householdId: actingMember.householdId },
  });
  if (!task) throw new ForbiddenError("Task not found.");

  const isOwner = task.createdById === actingMember.id;
  const isAssignee = task.assigneeId === actingMember.id;
  if (!isOwner && !isAssignee) {
    throw new ForbiddenError("You can only edit tasks you created or are assigned to.");
  }

  return prisma.task.update({ where: { id: task.id }, data: input });
}
```

Note this check happens *in addition to* — not instead of — the tenant scope
(`householdId: actingMember.householdId` in the `findFirst`) and is unrelated
to `visibility`/`ObjectShare` (§5), which governs *reads*, not who can edit.

---

## 5. Visibility & `ObjectShare`: the shared query-scoping helper

The plan defines one visibility contract reused by every shareable entity:

> `private | household | specific_members`. `private` = truly hidden from
> everyone but the owner, no admin/owner override ever. `household` = dynamic
> membership check at read time. `specific_members` = via `ObjectShare`.

This is enforced by **one function**, never by ad-hoc `if (visibility ===
"private")` checks copy-pasted into each module's queries.

### 5.1 Which entities this applies to

Only entities that actually carry a `visibility` column in
`docs/orm-conventions.md` go through this helper: `Task`, `Note`, `Event`,
`KanbanBoard`, `Transaction`, `Document`, `Renewal`, `Contact`,
`ShoppingList`. Entities *without* a `visibility` field (e.g. `Subscription`,
`Budget`, `Category`, `ShoppingListItem`) are implicitly household-wide —
scope those with the plain tenant clause `householdId:
actingMember.householdId` and stop there; don't add OR-branches that don't
exist in the schema.

### 5.2 `ownerField` per entity

`ObjectShare` is generic (`moduleKey`, `objectType`, `objectId`), but "am I
the owner of this row" is keyed off whatever field each entity uses for its
creator/author — there's no single column name across models. The helper
takes that field name as a parameter:

| Entity | `ownerField` | `moduleKey` | `objectType` |
|---|---|---|---|
| `Task` | `createdById` | `tasks` | `Task` |
| `Note` | `authorMemberId` | `notes` | `Note` |
| `Event` | `createdById` | `calendar` | `Event` |
| `KanbanBoard` | `createdById` | `kanban` | `KanbanBoard` |
| `Document` | `uploadedBy` | `life_admin` | `Document` |
| `Renewal` | `createdBy` | `life_admin` | `Renewal` |
| `Contact` | `createdBy` | `life_admin` | `Contact` |
| `ShoppingList` | `createdBy` | `life_admin` | `ShoppingList` |
| `Transaction` | `paidBy`\* | `finance` | `Transaction` |

\* The plan's Transaction field list has no explicit creator/author field —
`paidBy` is the closest proxy and is what this harness uses for the
private/specific_members "am I the owner" branch. Flag this in
`docs/orm-conventions.md` when the Finance module's schema is written, in case a
real `createdById` gets added later, in which case update this row and the
call site in `src/modules/finance/transactions/queries.ts` together.

`moduleKey` values above are exactly the `resourceDomain` values from
`ModulePermissionDeclaration` (`tasks/kanban/calendar/reminders/notes/
finance/life_admin/members_household/notifications_email/
cross_module_events`) — one Life Admin module owns `Document`, `Renewal`,
`Contact`, and `ShoppingList` together, so all four share `moduleKey:
"life_admin"`.

### 5.3 The helper

```ts
// lib/access/visibility.ts
import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";

export type VisibilityScope = {
  /** Module.key that owns this entity, e.g. "tasks", "finance", "life_admin" */
  moduleKey: string;
  /** ObjectShare.objectType for this entity, e.g. "Task", "Transaction" */
  objectType: string;
  /** The field on this Prisma model holding the creator/author Member id */
  ownerField: string;
};

/**
 * Builds the Prisma `where` fragment that scopes a query on a shareable
 * entity to what `actingMember` is allowed to see, per the visibility
 * contract in plan.md. Always combine with other filters via `AND`, never
 * spread both into the same object — visibility and caller filters each
 * carry their own `OR`, and a naive spread merge silently drops one of them.
 */
export async function visibilityWhere(actingMember: Pick<ActingMember, "id" | "householdId">, scope: VisibilityScope) {
  const shares = await prisma.objectShare.findMany({
    where: {
      householdId: actingMember.householdId,
      moduleKey: scope.moduleKey,
      objectType: scope.objectType,
      sharedWithMemberId: actingMember.id,
    },
    select: { objectId: true },
  });
  const sharedObjectIds = shares.map((s) => s.objectId);

  return {
    householdId: actingMember.householdId,
    OR: [
      { visibility: "household" as const },
      { visibility: "private" as const, [scope.ownerField]: actingMember.id },
      {
        visibility: "specific_members" as const,
        OR: [{ [scope.ownerField]: actingMember.id }, { id: { in: sharedObjectIds } }],
      },
    ],
  };
}
```

### 5.4 Using it — always via `AND`, never a naive spread

```ts
// modules/tasks/queries.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";

export async function listTasks(actingMember: ActingMember, filters: { assigneeId?: string; boardId?: string }) {
  const where: Prisma.TaskWhereInput = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "tasks",
        objectType: "Task",
        ownerField: "createdById",
      }),
      filters,
    ],
  };

  return prisma.task.findMany({ where, orderBy: { dueDate: "asc" } });
}
```

```ts
// ❌ Wrong — spreading two objects that each define `OR` clobbers one of them
const where = { ...(await visibilityWhere(...)), ...filters }; // filters.OR would silently replace visibility's OR

// ✅ Right — combine with AND so both OR-clauses are preserved
const where = { AND: [await visibilityWhere(...), filters] };
```

This is why `visibilityWhere` exists as a shared helper rather than
per-module logic: every module gets the `AND`-composition right by
construction, instead of each author having to remember the spread pitfall
above independently.

### 5.5 Detail queries need it too, not just lists

A `findUnique`/`findFirst` for a single record is just as exposed as a list
— an attacker (or a buggy link) guessing a `Task` id from another household
or from a `private` note must get a 404, not the record:

```ts
// modules/notes/queries.ts
export async function getNote(actingMember: ActingMember, noteId: string) {
  const where: Prisma.NoteWhereInput = {
    AND: [
      { id: noteId },
      await visibilityWhere(actingMember, { moduleKey: "notes", objectType: "Note", ownerField: "authorMemberId" }),
    ],
  };
  const note = await prisma.note.findFirst({ where });
  if (!note) throw new NotFoundError("Note not found."); // never distinguish "exists but hidden" from "doesn't exist"
  return note;
}
```

---

## 6. Tenant isolation checklist

Visibility scoping assumes tenant isolation already holds — a `household`-
visibility `Task` from a *different* household must never leak in just
because visibility says "yes." Every query on a household-scoped model must
include `householdId: actingMember.householdId` even before visibility is
considered. `visibilityWhere()` bakes this in (see §5.3 — it always sets
`householdId` at the top level), so any query going through it is covered
automatically. The two cases to watch by hand:

- A raw `prisma.<model>.findUnique({ where: { id } })` on a household-scoped
  model **without** going through `visibilityWhere` — use `findFirst({
  where: { id, householdId } })` instead, always.
- Any join/include across modules (e.g. loading a `Task`'s linked
  `Document` via `NoteLink`) — the second model must be re-scoped by
  `householdId` independently; a relation existing is not proof it belongs
  to the same household unless the schema enforces it with a compound FK.

---

## 7. Reviewing and revoking a module's `ModuleGrant`

This is, per the plan, *"the one end-user-facing part of the extensibility
system (review/revoke)."* The pieces:

- `ModulePermissionDeclaration` — platform catalog data (not household-scoped,
  same tier as `Module`/`ModuleEventType`): what a module *wants* — a
  `resourceDomain`, an `accessLevel` (`read`/`write`/`read_write`), a human
  `purpose` string, and `isRequired`.
- `ModuleGrant` — household-scoped: whether *this household* has actually
  said yes (`granted`/`revoked`/`pending_review`).

### 7.1 Seeding at household creation

Built-in modules' **required** declarations are pre-granted automatically —
"all 8 apps work immediately with zero setup." Everything else (optional
declarations of built-in modules, and *every* declaration of a custom
module) starts in `pending_review` so it shows up in the Settings UI as
something the household can act on.

```ts
// lib/access/module-grants.ts
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Run once, inside the same transaction that creates the Household. */
export async function seedModuleGrantsForHousehold(db: Db, householdId: string) {
  const declarations = await db.modulePermissionDeclaration.findMany({
    include: { module: true },
  });

  await db.moduleGrant.createMany({
    data: declarations.map((decl) => ({
      householdId,
      moduleId: decl.moduleId,
      permissionDeclarationId: decl.id,
      status: decl.isRequired && decl.module.kind === "built_in" ? "granted" : "pending_review",
    })),
  });
}
```

```ts
// app/(onboarding)/actions.ts
"use server";

export async function createHousehold(input: CreateHouseholdInput) {
  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: input.name, timezone: input.timezone, baseCurrency: input.baseCurrency, status: "active" },
    });
    const owner = await tx.member.create({
      data: { householdId: household.id, displayName: input.ownerName, email: input.ownerEmail, role: "owner", status: "active" },
    });
    await seedModuleGrantsForHousehold(tx, household.id);
    return household;
  });
}
```

The same `seedModuleGrantsForHousehold` logic (as an upsert, not a blind
`createMany`) also runs whenever a new module — including a 9th, developer-
added one — registers a new `ModulePermissionDeclaration`, so existing
households pick up a `pending_review` row for it without a manual migration
per household.

### 7.2 Checking a grant before acting

Any module reading/writing another module's resource domain checks the
grant immediately before doing so, and degrades gracefully (skips the
cross-module side effect; does not throw) if it's missing — this is the
concrete mechanism behind the plan's *"isRequired (false = must degrade
gracefully without it)."*

```ts
// lib/access/module-grants.ts
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

```ts
// modules/finance/subscriptions/actions.ts — Finance auto-creating a follow-up Task
// (Finance declares resourceDomain: "tasks", accessLevel: "write", isRequired: false,
//  purpose: "Create a follow-up task when a subscription payment needs manual confirmation")
export async function handleSubscriptionPaymentNeedsConfirmation(subscription: Subscription) {
  const canWriteTasks = await hasModuleGrant(subscription.householdId, "finance", "tasks", "write");
  if (!canWriteTasks) {
    return; // graceful degradation — no Task created, Finance's own record still updates fine
  }
  await prisma.task.create({
    data: {
      householdId: subscription.householdId,
      title: `Confirm payment for ${subscription.name}`,
      sourceModule: "finance",
      sourceEntityId: subscription.id,
      createdById: subscription.responsibleMember,
      priority: "medium",
      visibility: "household",
    },
  });
}
```

### 7.3 The Settings UI: review and revoke

```ts
// app/(app)/settings/modules/actions.ts
"use server";

import { requireMember } from "@/lib/auth/session";
import { canManageModuleGrant } from "@/lib/access/household-permissions";
import { ForbiddenError } from "@/lib/access/errors";
import { prisma } from "@/lib/db";

export async function reviewModuleGrant(input: {
  permissionDeclarationId: string;
  decision: "granted" | "revoked";
}) {
  const actingMember = await requireMember();

  const declaration = await prisma.modulePermissionDeclaration.findUniqueOrThrow({
    where: { id: input.permissionDeclarationId },
  });

  if (!canManageModuleGrant(actingMember, declaration)) {
    throw new ForbiddenError(
      declaration.isRequired
        ? "Only the owner can revoke a permission a built-in module requires to function."
        : "Only an admin or owner can review module permissions.",
    );
  }

  return prisma.moduleGrant.update({
    where: {
      householdId_permissionDeclarationId: {
        householdId: actingMember.householdId,
        permissionDeclarationId: declaration.id,
      },
    },
    data: { status: input.decision },
  });
}
```

```ts
// lib/access/household-permissions.ts (addition)
export function canManageModuleGrant(
  actingMember: ActingMember,
  declaration: { isRequired: boolean },
): boolean {
  if (declaration.isRequired) return actingMember.role === "owner"; // revoking this can break a built-in module
  return hasAtLeastRole(actingMember.role, "admin");
}
```

```tsx
// app/(app)/settings/modules/page.tsx
import { requireMember } from "@/lib/auth/session";
import { hasAtLeastRole } from "@/lib/access/roles";
import { prisma } from "@/lib/db";
import { ModuleGrantList } from "./module-grant-list";

export default async function ModulesSettingsPage() {
  const actingMember = await requireMember();

  const modules = await prisma.module.findMany({
    where: { status: { not: "disabled" } },
    include: {
      permissionDeclarations: {
        include: {
          grants: { where: { householdId: actingMember.householdId } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // read-only for members: everyone can see what a module can access
  // (household transparency), only admin/owner can flip a toggle
  return <ModuleGrantList modules={modules} canManage={hasAtLeastRole(actingMember.role, "admin")} />;
}
```

`pending_review` rows are what surface as a "Needs review" banner in
`ModuleGrantList` — a custom (non-built-in) module is unusable by that
household until every one of its declarations moves out of
`pending_review`, per the plan's *"Custom modules always require explicit
household review before first use (confirmed decision — no auto-grant
convenience for custom modules)."*

---

## 8. Adding a new permission-gated action

Recipe for any new Server Action that needs a role check:

1. **Name the rule, don't inline it.** Decide whether it's a plain
   `hasAtLeastRole(actingMember.role, "admin")` check, or an asymmetric one
   like `canRemoveMember`. Add a function to `lib/access/household-
   permissions.ts` (or a module-specific `lib/access/<module>-
   permissions.ts` file if the rule only makes sense inside one module, e.g.
   `lib/access/finance-permissions.ts` for "who can approve a `Settlement`").
2. **Call it first, before any read/write**, at the top of the Server
   Action, right after `requireMember()`.
3. **Re-scope every lookup by `householdId`** before checking anything about
   the target row (§6) — a role check against a row from another household
   is a bug, not a feature.
4. **If the action also lists/reads rows, add `visibilityWhere()`
   separately** (§5) — role and visibility are orthogonal; don't assume
   passing the role check means every row is visible, or vice versa.
5. **Add a test** in `tests/access/household-permissions.test.ts` asserting
   both the allow path and the deny path (see §9).

---

## 9. Extending a role's abilities (V1 has a fixed 3-role enum)

The plan locks `MemberRole` to exactly `owner | admin | member` for V1 — `CustomRole`
is explicitly out of scope until V2. This shapes how "add a new ability" and
"add a new role" are two very different operations:

### 9.1 Adding a new ability to an existing role — do this

This is the common case (e.g. "only admin+ can archive a `KanbanBoard`," a
rule the plan doesn't spell out yet but a later feature needs). Add one
function, following the exact shape of §3.1's table:

```ts
// lib/access/household-permissions.ts
export function canArchiveBoard(actingMember: ActingMember): boolean {
  return hasAtLeastRole(actingMember.role, "admin");
}
```

Call it from the Server Action (`app/(app)/kanban/boards/actions.ts`),
add a row to the capability table in §3.1 of this doc, and add both a pass
and a fail test case. That's the entire change — no schema migration, no
touching `ROLE_RANK`.

### 9.2 Adding a literal new role value — don't, without doing all of this

If a future requirement genuinely needs a 4th role (not asked for in V1;
this is a "when it happens" note, not a task to do now), every one of these
must move together in the same change, or role checks silently
misbehave:

1. `enum MemberRole` in `prisma/schema.prisma` gains the value, plus a migration.
2. `ROLE_RANK` in `lib/access/roles.ts` gets the new value inserted at the
   correct rank — every existing `hasAtLeastRole` call site is affected the
   moment this changes, so audit all of them, not just the new one.
3. Every function in §3.1's table that pattern-matches on a *specific* role
   literal (`canRemoveMember`, `canChangeMemberRole` — the asymmetric ones)
   needs an explicit decision for the new role, not an assumption that rank
   comparison covers it. This is exactly why those two are hand-written
   `if` chains instead of `hasAtLeastRole` calls — a new role can't silently
   fall through them unnoticed.
4. Seed data / fixtures used by tests (`tests/fixtures/household.ts` or
   equivalent, see `docs/testing.md`) get a member with the new role so
   `tests/access/household-permissions.test.ts` actually exercises it.

### 9.3 The seam reserved for V2 `CustomRole` — don't simulate it early

If a requirement shows up that doesn't fit the 3-role hierarchy at all (e.g.
"this specific member can moderate Finance sharing but not Tasks sharing" —
a per-member, per-domain override), that is precisely the `CustomRole`
seam the plan defers to V2. Resist adding a workaround in V1 such as boolean
flags on `Member` (`isFinanceModerator`, etc.) — those don't compose, don't
show up in the capability table, and have to be manually ported into
whatever `CustomRole`'s permission-matrix table ends up looking like. Until
`CustomRole` ships:

- Every capability check stays a named boolean function in
  `lib/access/household-permissions.ts` (or a module-specific
  `*-permissions.ts`), keyed off `MemberRole`, never off `Member.id`.
- If a rule seems to need a per-member exception, that's a signal the
  feature belongs in the V2 roadmap discussion, not a V1 workaround.
- When `CustomRole` does ship, the intended shape (for whoever builds it) is
  that `ROLE_RANK`-based checks get replaced by a lookup against a
  household-scoped permission-matrix table keyed by `(role_or_member,
  capability)` — `hasAtLeastRole` and the capability functions in this doc
  are the exact call sites that would be swapped to query it instead of the
  static `ROLE_RANK` map, which is why every capability stays behind a named
  function today rather than an inline role comparison.

---

## 10. Testing access control

Access control is tested at the `lib/access/*` function level (pure inputs,
no DB) and at the Server Action level (allow/deny against a seeded test
household) — see `docs/testing.md` for the runner/fixture setup. Shape:

```ts
// tests/access/household-permissions.test.ts
import { describe, it, expect } from "vitest";
import { canRemoveMember, canChangeMemberRole } from "@/lib/access/household-permissions";

describe("canRemoveMember", () => {
  it("lets an owner remove an admin", () => {
    expect(canRemoveMember({ role: "owner" } as any, { role: "admin" })).toBe(true);
  });

  it("does not let an admin remove another admin", () => {
    expect(canRemoveMember({ role: "admin" } as any, { role: "admin" })).toBe(false);
  });

  it("lets an admin remove a plain member", () => {
    expect(canRemoveMember({ role: "admin" } as any, { role: "member" })).toBe(true);
  });

  it("never lets a member remove anyone", () => {
    expect(canRemoveMember({ role: "member" } as any, { role: "member" })).toBe(false);
  });
});
```

```ts
// tests/access/visibility.test.ts — assert the composition pitfall from §5.4 stays fixed
it("keeps both the visibility OR and the caller's filter OR when combined", async () => {
  const where = {
    AND: [
      await visibilityWhere(memberA, { moduleKey: "tasks", objectType: "Task", ownerField: "createdById" }),
      { OR: [{ priority: "high" }, { priority: "urgent" }] },
    ],
  };
  // ...assert both AND branches are present in `where`, not just one
});
```

Every new capability function from §8/§9.1 ships with both an allow and a
deny test in the same commit as the Server Action that uses it — this
mirrors the same "tests written alongside the feature, not after" convention
used across the rest of the harness (see `docs/testing.md`).

---

## Appendix: file map

| File | Purpose |
|---|---|
| `lib/access/session.ts` | `requireMember()` — the only source of role/householdId/memberId |
| `lib/access/roles.ts` | `ROLE_RANK`, `hasAtLeastRole()` |
| `lib/access/household-permissions.ts` | Named capability functions (`canInviteMember`, `canRemoveMember`, `canChangeMemberRole`, `canModerateSharing`, `canCloseHousehold`, `canTransferOwnership`, `canManageModuleGrant`, `assertNotLastOwner`) |
| `lib/access/visibility.ts` | `visibilityWhere()` — the shared query-scoping helper for `private/household/specific_members` |
| `lib/access/module-grants.ts` | `seedModuleGrantsForHousehold()`, `hasModuleGrant()` |
| `lib/access/errors.ts` | `ForbiddenError`, `NotFoundError` |
| `app/(app)/members/actions.ts` | Invite/remove/role-change Server Actions |
| `app/(app)/settings/modules/actions.ts` | `reviewModuleGrant()` |
| `app/(app)/settings/modules/page.tsx` | Household-facing module permission review/revoke UI |
| `tests/access/household-permissions.test.ts` | Allow/deny tests per capability function |
| `tests/access/visibility.test.ts` | `visibilityWhere()` composition tests |
