# Recipes

Concrete, worked "how do I…" examples for the six situations that come up
in almost every module, once the underlying conventions (`docs/auth.md`,
`docs/access-control.md`, `docs/orm-conventions.md`, `docs/project-structure.md`,
`docs/resources.md`, `docs/seeding.md`) are already understood. This doc
doesn't re-explain *why* the platform is shaped the way it is — it shows
*where the files go and what the code looks like* for one task at a time.
If a recipe below and one of those docs ever disagree on the underlying
rule (not just a file name), the other doc wins; this file only assembles
patterns those docs already established.

Every code sample is real enough to copy-paste and adapt — swap the entity
name, the role, the event key — not illustrative pseudocode with the hard
parts elided.

---

## 0. Conventions this doc follows, and why

Two small naming forks exist across the harness's own docs. Per
`docs/resources.md` §0's resolution rule — "`docs/project-structure.md`
wins on where files go and what things are named" — this doc follows that
file's naming throughout, and flags the variant once here instead of at
every call site:

| Concept | Name used in this doc | Also seen as |
|---|---|---|
| Acting-member resolver | `requireMember()` from `@/lib/auth/session` (resolves `{ member, household }`, redirects to `/login` if unauthenticated) | `getCurrentMember()` in `docs/auth.md`, `getActingMember()` in `docs/access-control.md` |
| Role gate | `requireRole(member, allowedRoles)` from `@/lib/auth/permissions` | `hasAtLeastRole()` / named `canX()` functions in `docs/access-control.md` |
| Visibility query-scoping helper | `withVisibility()` from `@/lib/household/visibility` | `visibilityWhere()` in `docs/access-control.md` |
| Prisma client | `@/lib/db` (`src/lib/db.ts`) | `@/lib/db` in `docs/access-control.md` |
| A module's self-description file | `module.ts` (per `docs/project-structure.md`'s tree, §2/§9, and `AGENTS.md` §2) | `module.manifest.ts` in `docs/resources.md` and `docs/seeding.md` — if your checkout has already standardized on that name, every `module.ts` reference below is the same file under that name; nothing else in these recipes changes |

The underlying logic behind each pair is identical (same inputs, same
`AND: [visibility, ...filters]` composition, same "load through household +
visibility before anything else" order) — reconciling the names later is a
rename, not a redesign.

---

## 1. Protect a Server Action by role (owner / admin / member)

**Use this when:** the rule is a plain hierarchy — "admin or higher can do
X" — with no dependency on *whose* object it is or what role the *target*
of the action holds.

### 1.1 The two building blocks

```ts
// src/lib/auth/permissions.ts
import type { Role } from "@prisma/client";
import { ForbiddenError } from "@/lib/errors";

export const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

export function hasAtLeastRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Throws ForbiddenError unless the acting member's role is one of `allowed`.
 * This covers every plain ROLE-HIERARCHY check. It does NOT cover asymmetric
 * rules where the check also depends on a *target* member's role (§1.3) —
 * don't grow this function an `if` for those; give the rule its own name.
 */
export async function requireRole(member: { role: Role }, allowed: Role[]) {
  if (!allowed.includes(member.role)) {
    throw new ForbiddenError(`This action requires one of: ${allowed.join(", ")}.`);
  }
}
```

`requireMember()` (`src/lib/auth/session.ts`, `docs/auth.md` §6) is what
produces the `member`/`household` pair every Server Action starts from —
never accept either as a function argument from the client.

### 1.2 Worked example: inviting a member (admin or owner only)

Plan.md §2.3: "An owner or admin issues an Invite." A plain hierarchy check.

```ts
// src/lib/household/actions/invite-member.ts
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/permissions";
import { inviteInputSchema, type InviteInput } from "../entities/invite";

export async function inviteMember(input: InviteInput) {
  const { member, household } = await requireMember();

  // Role check FIRST, before touching anything else about the request.
  await requireRole(member, ["owner", "admin"]);

  const data = inviteInputSchema.parse(input); // { email, role: "admin" | "member" }

  const existingActiveMember = await prisma.member.findFirst({
    where: { householdId: household.id, email: data.email, status: "active" },
  });
  if (existingActiveMember) {
    throw new Error("That email already belongs to an active member of this household.");
  }

  const invite = await prisma.invite.create({
    data: {
      householdId: household.id,
      email: data.email,
      role: data.role, // "admin" | "member" only — never "owner" (plan.md §2.3)
      invitedByMemberId: member.id,
      token: randomBytes(32).toString("hex"),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default
    },
  });

  revalidatePath("/settings/members");
  return invite;
}
```

### 1.3 When a plain rank check isn't enough: asymmetric rules

`requireRole()` answers "is the acting member's role at least X." It cannot
express plan.md's "admins can invite/remove non-owner members, but only the
owner can remove or demote another **admin**" — that depends on the
*target's* role too. Give that its own named function, next to
`requireRole()`, rather than teaching `requireRole()` a special case:

```ts
// src/lib/auth/permissions.ts (addition)
export function canRemoveMember(actingRole: Role, targetRole: Role): boolean {
  if (actingRole === "owner") return true;
  if (actingRole === "admin") return targetRole === "member"; // never touches a peer admin
  return false;
}
```

```ts
// src/lib/household/actions/remove-member.ts (excerpt)
"use server";

export async function removeMember(targetMemberId: string) {
  const { member, household } = await requireMember();

  const targetMember = await prisma.member.findFirst({
    where: { id: targetMemberId, householdId: household.id }, // re-scope before checking anything
  });
  if (!targetMember) throw new ForbiddenError("Member not found in this household.");

  if (!canRemoveMember(member.role, targetMember.role)) {
    throw new ForbiddenError("Only the owner can remove an admin.");
  }

  if (targetMember.role === "owner") {
    await assertNotLastOwner(household.id, targetMember.id); // plan.md: household always has ≥1 owner
  }

  // plan.md §2.4: removed members' owned objects stay attributed to them —
  // this is a status flip, never a delete or reassignment.
  return prisma.member.update({ where: { id: targetMember.id }, data: { status: "removed" } });
}
```

See `docs/access-control.md` §3 for the full capability table
(`canInviteMember`, `canChangeMemberRole`, `canCloseHousehold`,
`canTransferOwnership`, `assertNotLastOwner`, …) — every one of them follows
this same "named function, not an inline role comparison" shape.

### 1.4 Test both paths, in the same commit

Per `CLAUDE.md` rule 4, `invite-member.ts` ships with
`invite-member.test.ts` covering both:

```ts
// src/lib/household/actions/invite-member.test.ts
import { describe, it, expect, vi } from "vitest";
import { inviteMember } from "./invite-member";
import { seedMemberWithHousehold } from "@/test/helpers/seed-member"; // docs/auth.md §9 pattern

describe("inviteMember", () => {
  it("lets an admin invite a new member", async () => {
    const { member } = await seedMemberWithHousehold({ role: "admin" });
    vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn().mockResolvedValue({ member, household: member.household }) }));

    await expect(inviteMember({ email: "new@person.test", role: "member" })).resolves.toMatchObject({ status: "pending" });
  });

  it("rejects a plain member", async () => {
    const { member } = await seedMemberWithHousehold({ role: "member" });
    vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn().mockResolvedValue({ member, household: member.household }) }));

    await expect(inviteMember({ email: "new@person.test", role: "member" })).rejects.toThrow(/requires one of/);
  });
});
```

---

## 2. Protect a route/page by role

Two different shapes, depending on whether the *whole page* is
role-restricted or only *one control inside* an otherwise-shared page is.

### 2.1 Full-page gate: the page shouldn't be reachable at all

`middleware.ts` only ever checks "is there a signed-in Supabase session" and
redirects to `/login` — it never special-cases a route by role
(`docs/access-control.md` §1). A role-restricted *page* does its own check,
inside the Server Component, and returns `notFound()` rather than a
"you're not allowed" message — a non-owner shouldn't learn the route even
exists:

```tsx
// src/app/(app)/settings/household/transfer-ownership/page.tsx
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/permissions";
import { getOtherActiveMembers } from "@/lib/household";
import { TransferOwnershipForm } from "@/lib/household/components/transfer-ownership-form";

export default async function TransferOwnershipPage() {
  const { member, household } = await requireMember();

  try {
    await requireRole(member, ["owner"]); // plan.md §2.2: transfer ownership is owner-only
  } catch {
    notFound();
  }

  const otherMembers = await getOtherActiveMembers(household.id, member.id);
  return <TransferOwnershipForm members={otherMembers} />;
}
```

### 2.2 Partial gate: everyone sees the page, only some can act on it

The Settings → Modules screen is the opposite shape on purpose — plan.md §7
calls `ModuleGrant` review "the one end-user-facing part of the
extensibility system," and every role should be able to see what a module
can access (household transparency); only admin/owner can flip a grant.
Gating the whole page would hide information a `member` is meant to see, so
gate the *control*, not the page, by passing a boolean down instead:

```tsx
// src/app/(app)/settings/modules/page.tsx
import { requireMember } from "@/lib/auth/session";
import { hasAtLeastRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { ModuleGrantReview } from "@/lib/module-registry/components/module-grant-review";

export default async function ModulesSettingsPage() {
  const { member, household } = await requireMember();

  const modules = await prisma.module.findMany({
    where: { status: { not: "disabled" } },
    include: {
      permissionDeclarations: { include: { grants: { where: { householdId: household.id } } } },
    },
    orderBy: { name: "asc" },
  });

  // Read-only for a plain member; the Server Action a toggle posts to
  // (`reviewModuleGrant`) ALSO calls requireRole()/canManageModuleGrant()
  // itself — this prop only controls whether the UI renders the control,
  // never the actual enforcement (docs/access-control.md §1: no
  // client-side-only checks).
  return <ModuleGrantReview modules={modules} canManage={hasAtLeastRole(member.role, "admin")} />;
}
```

**Pick §2.1 when** the page's mere existence/content is itself sensitive
(ownership transfer, closing the household). **Pick §2.2 when** the content
is fine for everyone to see and only a mutation needs gating — and either
way, the Server Action behind the mutation re-checks the role itself (§1),
regardless of what the page rendered.

---

## 3. Add a nested/sub-field to a form

**Use this when:** an existing Server Action + form needs a field that's
itself an object or a repeating list of objects — not a single scalar
input.

**Worked example:** adding `TransactionSplit` rows (plan.md §3.4) as a
repeating "who owes what share" sub-field group to the existing Transaction
form, shown only when `splitType !== "none"`.

### 3.1 Nest the sub-schema inside the parent `zod` schema

```ts
// src/modules/finance/entities/transaction.ts
import { z } from "zod";

export const transactionSplitInputSchema = z.object({
  memberId: z.string().cuid(),
  shareAmount: z.number().positive(),
  sharePercent: z.number().min(0).max(100).optional(), // derived display value only — not authoritative (plan.md §3.4)
});

export const transactionInputSchema = z
  .object({
    type: z.enum(["expense", "income"]),
    amount: z.number().positive(),
    currency: z.string().length(3).optional(), // defaults to Household.baseCurrency
    categoryId: z.string().cuid(),
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
    date: z.coerce.date(),
    paidById: z.string().cuid(),
    visibility: z.enum(["private", "household", "specific_members"]).default("household"),
    splitType: z.enum(["none", "equal", "percentage", "custom"]).default("none"),
    // the nested/repeating sub-field — an array of the sub-schema above
    splits: z.array(transactionSplitInputSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.splitType === "none") return true;
      if (!data.splits || data.splits.length === 0) return false;
      const sum = data.splits.reduce((total, split) => total + split.shareAmount, 0);
      return Math.abs(sum - data.amount) < 0.01; // currency-safe rounding tolerance
    },
    { message: "Split shares must add up to the transaction amount.", path: ["splits"] },
  );

export type TransactionInput = z.infer<typeof transactionInputSchema>;

// Reused by every query/action so the moduleKey/objectType/ownerField triple
// (docs/access-control.md §5.2) is defined exactly once. Transaction's
// scalar owner column is `paidById` (docs/orm-conventions.md §2.3's FK
// scalar/relation rule applied to plan.md's bare `paidBy` name).
export const TRANSACTION_VISIBILITY_SCOPE = {
  moduleKey: "finance",
  objectType: "Transaction",
  ownerField: "paidById",
} as const;
```

### 3.2 `react-hook-form`'s `useFieldArray` for the repeating rows

```tsx
// src/modules/finance/components/transaction-form.tsx
"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionInputSchema, type TransactionInput } from "../entities/transaction";
import { createTransaction } from "../actions/create-transaction";

export function TransactionForm({ members }: { members: { id: string; displayName: string }[] }) {
  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionInputSchema),
    defaultValues: { type: "expense", splitType: "none", visibility: "household", splits: [] },
  });

  // useFieldArray is the RHF primitive for a nested array of sub-objects —
  // this is the one new piece of API a single-scalar-field form doesn't need.
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "splits" });
  const splitType = form.watch("splitType");

  async function onSubmit(values: TransactionInput) {
    await createTransaction(values);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {/* ...title/amount/category/date/paidBy fields, omitted for brevity... */}

      {splitType !== "none" && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <select {...form.register(`splits.${index}.memberId`)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                {...form.register(`splits.${index}.shareAmount`, { valueAsNumber: true })}
              />
              <button type="button" onClick={() => remove(index)}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => append({ memberId: members[0]?.id ?? "", shareAmount: 0 })}>
            Add a split
          </button>
          {form.formState.errors.splits && (
            <p className="text-sm text-destructive">{form.formState.errors.splits.message as string}</p>
          )}
        </div>
      )}

      <button type="submit">Save transaction</button>
    </form>
  );
}
```

### 3.3 The Server Action writes parent + children in one transaction

```ts
// src/modules/finance/actions/create-transaction.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { transactionInputSchema, type TransactionInput } from "../entities/transaction";
import { emitTransactionRecorded } from "../events/emitters";

export async function createTransaction(input: TransactionInput) {
  const { member, household } = await requireMember();
  const data = transactionInputSchema.parse(input); // re-validate server-side — never trust the client's zod pass

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        householdId: household.id,
        type: data.type,
        amount: data.amount,
        currency: data.currency ?? household.baseCurrency,
        categoryId: data.categoryId,
        title: data.title,
        notes: data.notes ?? null,
        date: data.date,
        paidById: data.paidById,
        source: "manual",
        visibility: data.visibility,
        splitType: data.splitType,
        status: "posted",
      },
    });

    if (data.splitType !== "none" && data.splits) {
      await tx.transactionSplit.createMany({
        data: data.splits.map((split) => ({
          transactionId: created.id,
          householdId: household.id, // denormalized, per docs/orm-conventions.md §3.1
          memberId: split.memberId,
          shareAmount: split.shareAmount,
          sharePercent: split.sharePercent ?? null,
          // "the payer's own split is auto-settled at creation" (plan.md §3.4)
          settled: split.memberId === data.paidById,
        })),
      });
    }

    return created;
  });

  await emitTransactionRecorded(household.id, transaction.id, member.id);
  revalidatePath("/finance");
  return transaction;
}
```

### 3.4 Variant: a single nested object instead of a repeating array

Not every nested field is a list. Adding Task's optional recurrence
sub-object (`TaskRecurrenceRule`, plan.md §3.2) to the task form is the same
idea with one sub-object instead of an array — no `useFieldArray`, just a
nested schema key and conditional rendering:

```ts
// src/modules/tasks/entities/task.ts (addition)
export const taskRecurrenceInputSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).default(1),
  byWeekday: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(),
  endType: z.enum(["never", "on_date", "after_count"]).default("never"),
  endDate: z.coerce.date().optional(),
  occurrenceCount: z.number().int().min(1).optional(),
});

export const createTaskInputSchema = z.object({
  // ...existing scalar fields (title, dueDate, priority, assigneeId, ...)...
  isRecurring: z.boolean().default(false),
  recurrence: taskRecurrenceInputSchema.optional(), // nested object, present only when isRecurring
});
```

```tsx
// in the form component: form.watch("isRecurring") ? <RecurrenceFields /> : null
```

The Server Action then creates `Task` and, only `if (data.isRecurring)`,
`TaskRecurrenceRule` in the same `$transaction` — identical shape to §3.3,
minus the array loop.

### 3.5 Test both the accept and the reject path

```ts
// src/modules/finance/actions/create-transaction.test.ts
it("creates a transaction with equal splits summing to the amount", async () => { /* ... */ });
it("rejects splits that don't sum to the transaction amount", async () => {
  await expect(
    createTransaction({ /* ...amount: 100, splitType: "custom", splits: [{ memberId, shareAmount: 40 }] */ } as any),
  ).rejects.toThrow(/add up to the transaction amount/);
});
```

---

## 4. Create a Reminder from another module's code

**Use this when:** a module needs to alert a member at a point in time —
never build a second scheduling/alerting system; go through the shared
`Reminder` capability (`AGENTS.md` §2 Step 0's reuse table).

**Worked example:** Finance's Budget threshold alert (plan.md §3.4/§4.7,
`ROADMAP.md` §4: *"Budget threshold breach creates a Reminder (`sourceType
= budget`) and is subject to normal per-category notification opt-out."*).

### 4.1 Direct call, not an event — and why

Per decision #5 (this repo's canonical resolution, matching
`docs/project-structure.md` §3.3 and `docs/seeding.md` §5.4): every
built-in-to-built-in cross-module reaction in V1 is a **direct,
permission-checked function call through the barrel**, never a fan-out
through `EventSubscription`. Finance's `module.ts` already declares
`dependsOnModules: ["reminders"]` and a **required**
`ModulePermissionDeclaration` (`resourceDomain: "reminders", accessLevel:
"write"`) — required declarations of built-in modules are pre-seeded
`granted` for every household at creation (plan.md §7), so this call needs
**no runtime `hasModuleGrant()` check**. (Contrast with Finance's *optional*
`tasks`/write dependency for auto-creating a follow-up task — that one
**does** check `hasModuleGrant()` first, since a household can revoke an
optional grant; see `docs/access-control.md` §7.2.)

### 4.2 The sweep job

```ts
// src/modules/finance/jobs/sweep-budgets.ts
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";

// Illustrative — the exact period-boundary math is Finance's own concern,
// not this recipe's.
import { getCurrentPeriodRange } from "../entities/budget";

export async function sweepBudgetThresholds() {
  const budgets = await prisma.budget.findMany({
    where: { alertOnExceeded: true },
    include: { category: true },
  });

  for (const budget of budgets) {
    // "Current period" means as of now, not as of the budget's
    // effectiveFrom date — a monthly budget effective since January is
    // still evaluated against *this* calendar month's spend, not January's
    // (matching get-monthly-summary.ts's budgetsVsActual, which does the
    // same). Passing effectiveFrom here would freeze every budget's
    // "current" period at whenever it was created.
    const { start, end } = getCurrentPeriodRange(budget.period, new Date());

    const spendResult = await prisma.transaction.aggregate({
      where: {
        householdId: budget.householdId,
        categoryId: budget.categoryId,
        type: "expense",
        status: "posted",
        date: { gte: start, lte: end },
        ...(budget.memberId ? { paidById: budget.memberId } : {}), // personal vs whole-household budget
      },
      _sum: { amount: true },
    });

    const spent = spendResult._sum.amount ?? 0;
    const percentUsed = (spent / budget.amount) * 100;
    if (percentUsed < budget.alertThresholdPercent) continue;

    // Idempotency: don't re-fire on every 6am sweep run once this period's
    // alert has already gone out.
    const alreadyAlerted = await prisma.reminder.findFirst({
      where: {
        householdId: budget.householdId,
        sourceType: "budget",
        sourceEntityId: budget.id,
        status: { in: ["active", "paused"] },
        createdAt: { gte: start },
      },
    });
    if (alreadyAlerted) continue;

    // plan.md §9 Q25: a whole-household budget (memberId = null) notifies
    // EVERY active member, not just whoever tipped it over.
    const targetMemberIds = budget.memberId
      ? [budget.memberId]
      : (
          await prisma.member.findMany({
            where: { householdId: budget.householdId, status: "active" },
            select: { id: true },
          })
        ).map((m) => m.id);

    for (const targetMemberId of targetMemberIds) {
      // Direct barrel import — the same shape as life-admin's Renewal
      // reminders (docs/project-structure.md §3.3), not an EventSubscription.
      await createReminder({
        householdId: budget.householdId,
        title: `Budget alert: ${budget.category.name} is at ${Math.round(percentUsed)}%`,
        targetMemberId,
        createdByMemberId: targetMemberId, // system-triggered — attributed to the recipient
        sourceType: "budget",
        sourceModule: "finance",
        sourceEntityId: budget.id,
        // plan.md §3.3: an event-driven source with no future anchor date
        // fires immediately — firstRemindAt = now, reminderType = one_off,
        // leadTimeValue/leadTimeUnit stay unset.
        reminderType: "one_off",
        firstRemindAt: new Date(),
      });
    }
  }
}
```

```ts
// src/app/api/cron/budgets-sweep/route.ts
import { sweepBudgetThresholds } from "@/modules/finance/jobs/sweep-budgets";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await sweepBudgetThresholds();
  return new Response("ok");
}
```

### 4.3 What happens after `createReminder()` returns

Nothing else in Finance's code. `createReminder()` is Reminders' own public
surface — it creates the `Reminder` + its first `ReminderOccurrence`
row(s); the `reminders-sweep` cron job (`src/modules/reminders/jobs/
sweep-due-occurrences.ts`) fires it at `remindAt`, and delivery is gated by
the target member's own `budget.threshold_exceeded`-category
`NotificationPreference` exactly like every other reminder (plan.md §9
Q24: "subject to normal opt-out, like every other category") — Finance
never touches email or `NotificationPreference` directly.

---

## 5. Subscribe a hypothetical 9th module to a built-in's `ModuleEventType`

This is the general-purpose mechanism `EventSubscription` exists for — and
it looks structurally different from Kanban's one built-in exception
(`docs/seeding.md` §5.4), even when the two subscribe to the exact same
event.

### 5.1 The contrast, side by side

Both examples below react to `tasks`' `task.completed` — the same event
Kanban itself reacts to (`docs/seeding.md` §5.4) — which makes the
structural difference easy to see:

| | Kanban → `task.completed` | `meal_planning` → `task.completed` |
|---|---|---|
| `Module.kind` | `built_in` | `custom` |
| Why an `EventSubscription` at all | `tasks` has no `dependsOnModules` entry pointing at `kanban` (deps only ever run `kanban → tasks`, never the reverse), so `completeTask()` has no way to call back into Kanban directly — it only emits the event | `meal_planning` has no structural need to depend on `tasks` in this direction at all; this is an optional, decoupled reaction it chooses to have |
| Is this reused by other built-ins? | **No** — the single built-in-to-built-in `EventSubscription` row in V1 (`docs/project-structure.md` §3.3, `docs/seeding.md` §5.4); every other built-in reaction is a direct barrel call | **Yes** — this is what every 9th/custom module's optional reaction looks like; nothing distinguishes `meal_planning` from a hypothetical 10th module here |
| `ModuleGrant` gating | None needed — Kanban's required-declaration grants are pre-seeded `granted` for every household, same as all 8 built-ins | `meal_planning`'s grants start `pending_review` (plan.md §9 Q34) — its own handler must check `hasModuleGrant()` and no-op gracefully until a household approves it |
| Registered via | `src/modules/kanban/module.ts`'s `eventSubscriptions` array | `src/modules/meal-planning/module.ts`'s `eventSubscriptions` array — the exact same field, same shape |

Kanban is simply the first (and, for the 8 built-ins, only) module to use
this mechanism — not a special case of it.

### 5.2 Declaring the subscription

```ts
// src/modules/meal-planning/module.ts (addition, alongside the
// moduleRegistration/eventTypes/permissionDeclarations/surfaceRegistrations
// from AGENTS.md §2 steps 3–7)
export const eventSubscriptions = [
  {
    eventTypeKey: "task.completed",
    handler: "meal-planning/events/onTaskCompleted", // src/modules/meal-planning/events/subscribers.ts
  },
];
```

### 5.3 The handler — gracefully a no-op for anything not its own

```ts
// src/modules/meal-planning/events/subscribers.ts
import { prisma } from "@/lib/db";
import { hasModuleGrant } from "@/lib/module-registry/permissions";
import type { EventOccurrence } from "@prisma/client";

export async function onTaskCompleted(occurrence: EventOccurrence) {
  // meal_planning is `kind: "custom"` — unlike Kanban, its access to Tasks
  // isn't pre-granted. Degrade silently if the household hasn't approved it.
  const canReadTasks = await hasModuleGrant(occurrence.householdId, "meal_planning", "tasks", "read");
  if (!canReadTasks) return;

  const payload = occurrence.payloadSnapshot as { taskId: string; completedById: string };

  // Only react if this was a prep task meal_planning itself created
  // (Task.sourceModule/sourceEntityId — docs/orm-conventions.md §4).
  const mealPlanItem = await prisma.mealPlanItem.findFirst({
    where: { householdId: occurrence.householdId, prepTaskId: payload.taskId },
  });
  if (!mealPlanItem) return; // not one of ours — nothing to do

  await prisma.mealPlanItem.update({ where: { id: mealPlanItem.id }, data: { preppedAt: new Date() } });
}
```

### 5.4 Nothing else changes

`prisma/seed/platform.ts`'s `eventSubscriptions` loop (`docs/seeding.md`
§5.3) is already generic over every module in `ALL_MODULES` — adding
`meal_planning` there (`docs/project-structure.md` §9 step 4) is the only
registration step; the loop itself, `tasks`' `completeTask()`, and Kanban's
own subscription are all untouched. If `meal_planning`'s
`EventSubscription.active` is later set `false` (or its `onFailure:
"disable_after_n_failures"` trips after repeated errors — plan.md §3.6),
`tasks`' `task.completed` emission is completely unaffected either way —
the dispatcher (`src/lib/events/dispatch.ts`) simply has one fewer active
subscriber to fan out to.

`onFailure` defaults to `log_only` (plan.md §3.6) — the right default for a
module's "genuinely optional" reaction. Reserve `disable_after_n_failures`
for a reaction whose repeated failure is worth auto-muting rather than just
logging.

---

## 6. Add a new `NotificationPreference` category end-to-end

**Use this when:** a module needs a new email-toggleable notification
category that **isn't** already backed by a `Reminder` (categories that
*are* — `bill.due_soon`, `budget.threshold_exceeded`, `reminder.due` —
surface in-app via `ReminderOccurrence` itself and get no separate
`Notification` row; plan.md §3.1's `Notification` entity section).

**Worked example:** Finance's `settlement.recorded` (plan.md §4.7 already
names this as an emitted event) — nobody's spending crossed a threshold, so
there's no `Reminder` in its path; it's exactly the shape `Notification`
exists to back: *"someone recorded a settlement with you."*

### 6.1 Resolve the real, dot-namespaced key first

Per `docs/orm-conventions.md` §2.5, `categoryKey` and `ModuleEventType.key`
share one snake_case, `<module_key>.<event_name>` namespace — resolve the
plan's colloquial event name to the real key before writing any code:
`finance.settlement_recorded`.

### 6.2 Declare the `ModuleEventType`

```ts
// src/modules/finance/module.ts (addition to the eventTypes array)
{
  owningModule: "finance",
  key: "finance.settlement_recorded",
  label: "Settlement recorded",
  payloadSummary: "{ settlementId, fromMemberId, toMemberId, amount }",
  contractVersion: 1,
  relatedEntityType: "Settlement",
},
```

### 6.3 Register it as an email-notification category

This is what makes it appear in every member's Settings → Notifications
screen with **zero changes** to that page's code — the same
"registration, not special-casing" principle as every other surface
(`docs/project-structure.md` §9):

```ts
// src/modules/finance/module.ts (addition to surfaceRegistrations)
{
  surface: "email_notification_category",
  label: "Someone recorded a settlement with you",
  target: "finance.settlement_recorded",
  sortOrder: 40,
},
```

### 6.4 Emit it from the action that creates the record

```ts
// src/modules/finance/actions/settle-split.ts (excerpt)
"use server";
import { emitEvent } from "@/lib/events/emit";

// ...after prisma.settlement.create(...):
await emitEvent(
  household.id,
  "finance.settlement_recorded",
  { settlementId: settlement.id, fromMemberId: settlement.fromMemberId, toMemberId: settlement.toMemberId, amount: settlement.amount },
  member.id,
);
```

### 6.5 Resolve who the Notification actually goes to

`src/lib/events/dispatch.ts` unconditionally writes a `Notification` row
for a category's target member(s) once `inAppEnabled` is on — that part is
baseline platform behavior a module doesn't opt into
(`docs/project-structure.md` §4.2). What no existing doc pins down yet is
*which* member(s) a payload with two members (`fromMemberId`/`toMemberId`)
resolves to. Follow the same per-key resolver-map shape
`docs/orm-conventions.md` §4.1 already established for `resolveSourceEntity()`,
rather than inventing a one-off `if` inside `dispatch.ts`:

```ts
// src/lib/notifications/recipients.ts
export const notificationRecipientResolvers: Record<string, (payload: any) => string[]> = {
  "task.assigned": (payload: { assigneeId: string }) => [payload.assigneeId],
  "share.received": (payload: { sharedWithMemberId: string }) => [payload.sharedWithMemberId],
  "household.invite_received": (payload: { invitedMemberId: string }) => [payload.invitedMemberId],
  // the person who was PAID BACK is the one who cares about this notification
  "finance.settlement_recorded": (payload: { toMemberId: string }) => [payload.toMemberId],
};
```

### 6.6 Reading the effective preference — lazy defaults, no backfill

Per `docs/seeding.md` §9.5, `NotificationPreference` rows are created
lazily, not fabricated up front for every member/category pair. A missing
row means "never touched this toggle," which defaults to all-on (plan.md
§3.1):

```ts
// src/lib/notifications/preferences.ts
import { prisma } from "@/lib/db";

export async function getEffectivePreference(memberId: string, categoryKey: string) {
  const stored = await prisma.notificationPreference.findUnique({
    where: { memberId_categoryKey: { memberId, categoryKey } }, // @@unique([memberId, categoryKey])
  });
  return stored ?? { emailEnabled: true, inAppEnabled: true, digestEnabled: true };
}
```

(`NotificationPreference`'s exact indexes aren't enumerated in
`docs/orm-conventions.md` yet — flag `@@unique([memberId, categoryKey])`
for whoever writes that model's Prisma block, the same way
`docs/seeding.md` §5.3 flags its own assumed compound keys.)

### 6.7 The email template

```tsx
// src/lib/email/templates/settlement-recorded.tsx
export function SettlementRecordedEmail({ fromName, amount, currency }: { fromName: string; amount: number; currency: string }) {
  return (
    <div>
      <p>{fromName} recorded a settlement of {currency} {amount.toFixed(2)} with you.</p>
    </div>
  );
}
```

### 6.8 What you did **not** have to touch

- `src/app/(app)/settings/notifications/page.tsx` — it already
  renders every `ModuleSurfaceRegistration(surface =
  "email_notification_category")` row generically; the new category just
  appears.
- `src/lib/events/dispatch.ts`'s core loop — it already creates a
  `Notification` row for any category with no `Reminder` in its path.
- Any other module's code.

### 6.9 Test it

```ts
// src/modules/finance/actions/settle-split.test.ts
it("creates a Notification for the receiving member when emailEnabled is on", async () => { /* ... */ });
it("still records the Settlement, but sends no email, when the receiver has finance.settlement_recorded emailEnabled=false", async () => { /* ... */ });
```
