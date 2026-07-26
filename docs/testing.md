# Testing

How Home OS proves a change works, in four layers, with two tools. This doc
owns the test runner/fixture setup that `docs/forms.md`, `docs/resources.md`,
`docs/ui-components.md`, and `docs/module-architecture.md` already assume and
excerpt from — if a test example in one of those docs disagrees with this
one on a mocking pattern or a file location, this doc wins (it's the one
whose whole job is the testing convention itself).

**Companion docs, not duplicated here:**
- [`CLAUDE.md`](../CLAUDE.md) rule 4 — the non-negotiable "tests land in the
  same change as the feature" rule this doc exists to make concrete.
- [`docs/project-structure.md`](./project-structure.md) §3 — the module
  folder anatomy (`entities/`, `actions/`, `queries/`, `jobs/`, `events/`,
  `components/`) this doc's four layers map directly onto.
- [`docs/access-control.md`](./access-control.md) — the role/visibility
  logic several of this doc's integration-test examples exercise; that doc
  owns *what* the rule is, this doc owns *how it's tested*.
- [`docs/forms.md`](./forms.md) §4.7/§7 and [`docs/resources.md`](./resources.md)
  §2.10 — already-committed worked examples of Server Action tests, written
  against this doc's conventions; §5 below is the same pattern restated with
  its own from-scratch worked example.
- [`docs/ui-components.md`](./ui-components.md) §12 — component-test
  conventions this doc restates in §6 rather than re-deriving.
- `docs/verify.md` — the full pre-"done" command checklist (referenced by
  `CLAUDE.md`); this doc's §9 gives the testing-specific subset of those
  commands directly so it doesn't depend on that file existing yet.

---

## 1. Philosophy: alongside, not after

Per `CLAUDE.md` rule 4: **a feature and its tests land in the same change,
never as a follow-up PR.** Concretely, that means:

- A new Server Action ships with its `.test.ts` file in the same commit —
  not "tests added later once the feature is confirmed working."
- A new Prisma model's business rule (a `.refine()` on its `zod` schema, a
  computed-status function) ships with a unit test proving the rule, in the
  same commit that adds the rule.
- A cross-module flow (a task's due date appearing on the calendar; a
  budget breach creating a reminder) gets its Playwright spec written
  alongside the second module's code that completes the flow — not
  retrofitted once both modules happen to exist.
- **"Tests were added after code review flagged a gap" is itself the
  failure mode this rule exists to prevent** — a reviewer should never need
  to ask "where's the test," because there already is one.

### The four layers, mapped onto Home OS's own folders

| Layer | Lives in | Tool | What's mocked | What it proves |
|---|---|---|---|---|
| **Unit** | `entities/*.ts`, small pure functions in `lib/*.ts` | Vitest | nothing | A `zod` schema or a business-rule function (e.g. `getTaskStatus()`) is correct in total isolation |
| **Integration** | `actions/*.ts`, `queries/*.ts`, `jobs/*.ts`, `events/*.ts`, `app/api/**/route.ts` | Vitest | `@/lib/db`, `@/lib/auth/session`, `@/lib/events/emit` | Auth resolution + role/visibility checks + business logic + the exact Prisma call shape a Server Action/job/route produces — without a live database |
| **Component** | `components/*.tsx` (Client Components only) | Vitest + React Testing Library | The module's own `actions/*` (mocked) | A form or interactive component renders, validates, and calls the right action with the right input |
| **Hook** | `src/hooks/*.ts` | Vitest + React Testing Library's `renderHook`/`act` | Whatever the hook itself calls (e.g. `sonner`) | A shared hook's own logic (e.g. `useActionFeedback`'s success/error branching) is correct in isolation, independent of any one component that happens to use it |
| **E2E** | `e2e/*.spec.ts` | Playwright | Nothing — real dev/build server + a real, seeded Postgres | A **cross-module** user flow genuinely works end to end |

Nothing in Home OS is tested at more than one of these layers for the same
concern — a `zod` rule is proven once, in a unit test, not re-asserted in
every Server Action test that happens to use it (`docs/forms.md` §6 makes
the same point about component tests not re-asserting `zod`'s own
validation).

---

## 2. Tool configuration

Two tools, two config files, two `pnpm` scripts. Unit, integration, and
component tests all run under Vitest — they're distinguished by *what they
import and mock*, not by a different runner or a different `describe`
convention.

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",              // needed for component tests; harmless for pure-function tests
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**"],               // Playwright owns e2e/, Vitest never touches it
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // mirrors tsconfig.json's "@/*" path
      // "server-only" isn't a real installed package (see below) — this
      // alias is what lets Vitest resolve `import "server-only"` at all.
      "server-only": path.resolve(__dirname, "./src/lib/test/server-only-stub.ts"),
    },
  },
});
```

```ts
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

**The `"server-only"` alias, and why it's needed.** `import "server-only"`
tags a handful of files that touch secrets or Node-only APIs
(`src/lib/supabase/admin.ts`, `src/lib/storage/paths.ts`,
`src/lib/household/actions/sync-object-shares.ts`, `src/lib/email/
resend-client.ts`, and any future file carrying the same tag). That
specifier resolves fine inside Next.js's own build (its bundler
special-cases the bare `"server-only"`/`"client-only"` strings) but isn't a
real package in `node_modules` at all — outside Next's compiler (Vitest,
`tsx`), resolving it throws `Cannot find module 'server-only'`. The
`resolve.alias` entry above points it at `src/lib/test/server-only-stub.ts`
(an empty `export {}`), so a test can import the **real** implementation of
a server-only-tagged file directly — `sync-object-shares.test.ts` and
`send-category-email.test.ts` both do this, mocking only `@/lib/db`/
`./resend-client`, not the file under test itself. `scripts/*.ts` run via
plain `tsx` (`docs/toolkit.md` §1 point 3) has no equivalent alias and still
can't import anything tagged this way — that limitation is unchanged, only
Vitest's is fixed.

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Lets Playwright log in as a seeded member — see §7.2 and docs/seeding.md §7.
    env: { ALLOW_DEV_SEED_AUTH_USERS: "true" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

```json
// package.json (excerpt)
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

### Why `@/lib/db` is mocked instead of hitting a real database

This is a deliberate, repo-wide choice, not a shortcut: **`pnpm test`
(unit + integration + component) never touches Postgres.** Every
integration test mocks `@/lib/db` directly (§5) instead of running
against a disposable test database. That means:

- CI runs the entire `pnpm test` suite with zero database provisioning —
  no Docker Postgres, no Supabase test project, no migration-then-seed step
  before the test job can start.
- A test failure is always attributable to the code under test, never to
  test-database state leaking between runs (a class of flake this repo
  never has to debug, because there's no shared mutable state to leak).
- The trade-off this accepts: a mocked-Prisma test does **not** prove a
  literal Prisma query is syntactically valid against the real schema
  (a typo'd field name inside a `where` clause still type-checks against
  the mock but would fail at runtime against a real client). `pnpm
  typecheck` catches most of this class of bug instead, since `vi.mocked()`
  preserves the real Prisma Client's generated types; genuinely new query
  shapes get their first real-database exercise in **e2e** (§7), which is
  the one layer that runs against an actual seeded Postgres instance.
- **One deliberate exception:** the tenant-guard Prisma Client Extension
  itself (`docs/orm-conventions.md` §3.2 — the piece that *implements*
  `@/lib/db`'s enforcement of "every scoped query includes
  `householdId`") cannot be tested by mocking `@/lib/db`, since it *is*
  the thing `@/lib/db` wraps. Its own test
  (`src/lib/prisma.test.ts`, colocated next to the singleton it guards)
  builds a minimal fake `PrismaClient`-shaped stub directly and asserts the
  extension throws/passes on specific `{ model, operation, args }` inputs —
  it does not go through the app-wide "mock `@/lib/db`" convention,
  because it's testing the thing other tests mock away.

---

## 3. Layer 1 — Unit tests

**What belongs here:** `zod` input schemas and their `.refine()` rules
(`entities/<entity>.ts`), and small pure functions with no I/O — computed
statuses (`getTaskStatus()`), date/period math (`getBudgetPeriodRange()`),
formatting helpers (`src/lib/currency.ts`, `src/lib/dates.ts`). Nothing here
imports `@/lib/db`, `@/lib/auth/session`, or anything else that talks to
the outside world — if a test needs `vi.mock(...)` for anything beyond
maybe `Date`, it isn't a unit test, it's an integration test (§5).

Test file sits directly next to what it tests: `entities/task.ts` →
`entities/task.test.ts`. No `describe` nesting beyond one level per
exported thing under test.

### Worked example: a `Task` must have a title

`plan.md` §3.2: *"`title` (string, required) — 1–200 chars."* This is
already encoded in `createTaskInputSchema`
(`docs/project-structure.md` §3.2):

```ts
// src/modules/tasks/entities/task.ts
import { z } from "zod";

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const createTaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  dueDate: z.date().optional(),
  dueDateAllDay: z.boolean().default(true),
  priority: taskPrioritySchema.default("medium"),
  assigneeId: z.string().cuid().optional(),
  parentTaskId: z.string().cuid().optional(),
  visibility: z.enum(["private", "household", "specific_members"]).default("household"),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
```

The unit test proves the boundary, not just the happy path — an empty
string, a missing field entirely, and both sides of the 200-character
limit:

```ts
// src/modules/tasks/entities/task.test.ts
import { describe, expect, it } from "vitest";
import { createTaskInputSchema } from "./task";

describe("createTaskInputSchema", () => {
  it("accepts a task with a valid title", () => {
    const result = createTaskInputSchema.safeParse({ title: "Take out the bins" });
    expect(result.success).toBe(true);
  });

  it("rejects a task with an empty title", () => {
    const result = createTaskInputSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["title"]);
    }
  });

  it("rejects a task with no title field at all", () => {
    const result = createTaskInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 200 characters", () => {
    const result = createTaskInputSchema.safeParse({ title: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts a title at exactly the 200-character boundary", () => {
    const result = createTaskInputSchema.safeParse({ title: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("defaults priority to medium and visibility to household when omitted", () => {
    const result = createTaskInputSchema.parse({ title: "Water the plants" });
    expect(result.priority).toBe("medium");
    expect(result.visibility).toBe("household");
  });
});
```

No `vi.mock` anywhere in this file — that's the tell that a test belongs in
§3, not §5. `getTaskStatus()` (`docs/project-structure.md` §3.2 —
`completedAt`/`dueDate` → `open | overdue | completed`) gets the identical
treatment: three `it` blocks, one per branch, no mocking, colocated as
`entities/task.test.ts` alongside the schema tests above (same file, since
both live in `entities/task.ts`).

---

## 4. Layer 2 — Integration tests: the mocking convention

**What belongs here:** `actions/*.ts` (Server Actions), `queries/*.ts`,
`jobs/*.ts` (scheduled-sweep functions invoked by a cron route),
`events/*.ts` (emitters and, for the one built-in exception below,
subscribers), and `app/api/**/route.ts` (the six Route Handlers from
`docs/project-structure.md` §6–§7). These are called "integration" tests
because they integrate several real layers of the module at once — session
resolution, role/visibility checks, business rules, the exact shape of the
Prisma call — with only the boundary to the outside world (Prisma itself,
Supabase auth, the event bus) replaced by a mock, per §2's rationale.

### 4.1 The standard mock set

Every integration test mocks the same three seams, and only these three
(add `@/modules/<other>` when the code under test calls another module's
barrel directly, e.g. `reminders`' `createReminder`):

```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    /* one vi.fn() per Prisma method the code under test actually calls */
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn() }));
```

`beforeEach(() => vi.clearAllMocks())` at the top of every `describe`
block — mocks never carry state between `it`s.

### 4.2 The rule: happy path + rejected/unauthorized path, minimum

Per `CLAUDE.md` rule 4: **every Server Action needs at least one test for
the happy path and one for a rejected/unauthorized path.** "Rejected" means
whichever of these applies to the action in question — there is always at
least one:

- A validation failure (bad `zod` input) never reaches `prisma.<model>.create`.
- A role/capability check failure (`docs/access-control.md` §3–§4) throws
  `ForbiddenError` before any write.
- A visibility/tenant-scope miss (the target row doesn't resolve for this
  household or isn't visible to this member) throws `NotFoundError` rather
  than silently succeeding or leaking a different household's row.

A query function's "rejected path" is usually a visibility test instead —
assert the `where` clause actually contains the tenant/visibility scoping,
not just that the function returns rows (`docs/resources.md` §2.10's
`get-visible-contacts.test.ts` is the template for that shape).

### 4.3 Worked example: a `Budget` threshold correctly creates exactly one `Reminder`

Per `plan.md` §3.4 and `ROADMAP.md` §4: a `Budget`'s actual spend is the
sum of matching expense `Transaction`s in the current period; crossing
`alertThresholdPercent` creates a `Reminder` (`sourceType: "budget"`) via
the shared Reminders capability (`docs/project-structure.md` §3.3 — Finance
calls `createReminder()` directly, no event needed); a whole-household
budget (`memberId: null`) alerts every member (`plan.md` §9 Q25). The sweep
runs on a schedule (`vercel.json`'s `budgets-sweep` cron, `ROADMAP.md` §8),
so **the same Budget must never accumulate a second alert Reminder for a
threshold it already crossed this period** — that idempotency guarantee is
exactly the kind of rule an integration test is for, since it depends on
what's already in the (mocked) database, not just on the input.

> This section sketches a plausible `sweep-budgets.ts` to give the test
> something concrete to exercise — the authoritative implementation is
> written when the Finance module itself is built. This doc fixes the
> *testing* convention such a job's tests follow, not Finance's business
> logic in detail.

```ts
// src/modules/finance/jobs/sweep-budgets.ts
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { getBudgetPeriodRange } from "../entities/budget";

/** Invoked by src/app/api/cron/budgets-sweep/route.ts on the vercel.json schedule. */
export async function sweepBudgetThresholds(now = new Date()) {
  const activeBudgets = await prisma.budget.findMany({
    where: {
      alertOnExceeded: true,
      effectiveFrom: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });

  for (const budget of activeBudgets) {
    await checkBudgetThreshold(budget.id, now);
  }
}

/**
 * Evaluates a single Budget's actual spend against alertThresholdPercent.
 * Creates one alert Reminder the first time the threshold is crossed in the
 * current period, and never a second one for the same Budget + period —
 * regardless of how many times the sweep runs before the period rolls over.
 */
export async function checkBudgetThreshold(budgetId: string, now = new Date()) {
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: budgetId } });
  const { periodStart, periodEnd } = getBudgetPeriodRange(budget.period, budget.effectiveFrom, now);

  // plan.md §3.4: "Actual spend = sum of expense Transactions matching
  // category (and member, if set) whose date falls in the current period."
  const spend = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      householdId: budget.householdId,
      categoryId: budget.categoryId,
      type: "expense",
      status: "posted",
      date: { gte: periodStart, lt: periodEnd },
      ...(budget.memberId ? { paidBy: budget.memberId } : {}),
    },
  });
  const actualSpend = spend._sum.amount ?? 0;
  const percentUsed = (actualSpend / budget.amount) * 100;
  if (percentUsed < budget.alertThresholdPercent) return null;

  // Idempotency: one alert Reminder per (Budget, period) — never per sweep run.
  const alreadyAlerted = await prisma.reminder.findFirst({
    where: {
      householdId: budget.householdId,
      sourceType: "budget",
      sourceEntityId: budget.id,
      firstRemindAt: { gte: periodStart, lt: periodEnd },
    },
  });
  if (alreadyAlerted) return null;

  // plan.md §9 Q25: memberId === null alerts every household member, not
  // just whoever's spending tipped it over; a personal budget alerts only its member.
  const targetMemberIds = budget.memberId
    ? [budget.memberId]
    : (
        await prisma.member.findMany({
          where: { householdId: budget.householdId, status: "active" },
          select: { id: true },
        })
      ).map((m) => m.id);

  return Promise.all(
    targetMemberIds.map((targetMemberId) =>
      createReminder({
        householdId: budget.householdId,
        title: `Budget alert: ${Math.round(percentUsed)}% of this period's limit used`,
        targetMemberId,
        sourceType: "budget",
        sourceModule: "finance",
        sourceEntityId: budget.id,
        firstRemindAt: now,
        reminderType: "one_off",
      }),
    ),
  );
}
```

```ts
// src/modules/finance/jobs/sweep-budgets.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { checkBudgetThreshold } from "./sweep-budgets";

vi.mock("@/lib/db", () => ({
  prisma: {
    budget: { findUniqueOrThrow: vi.fn() },
    transaction: { aggregate: vi.fn() },
    reminder: { findFirst: vi.fn() },
    member: { findMany: vi.fn() },
  },
}));
vi.mock("@/modules/reminders", () => ({ createReminder: vi.fn() }));

// A personal (single-member) monthly Budget — the simplest case for "exactly one".
const groceriesBudget = {
  id: "budget_1",
  householdId: "hh_1",
  categoryId: "cat_groceries",
  memberId: "mem_1",
  period: "monthly",
  amount: 400,
  alertThresholdPercent: 80,
  alertOnExceeded: true,
  effectiveFrom: new Date("2026-07-01"),
  endDate: null,
};

describe("checkBudgetThreshold", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates exactly one Reminder the first time spend crosses the threshold", async () => {
    vi.mocked(prisma.budget.findUniqueOrThrow).mockResolvedValue(groceriesBudget as any);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 340 } } as any); // 85% of $400
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null); // no alert yet this period
    vi.mocked(createReminder).mockResolvedValue({ id: "rem_1" } as any);

    const result = await checkBudgetThreshold("budget_1", new Date("2026-07-15"));

    expect(createReminder).toHaveBeenCalledTimes(1);
    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: "hh_1",
        targetMemberId: "mem_1",
        sourceType: "budget",
        sourceModule: "finance",
        sourceEntityId: "budget_1",
        reminderType: "one_off",
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("does not create a second Reminder if the sweep runs again in the same period", async () => {
    vi.mocked(prisma.budget.findUniqueOrThrow).mockResolvedValue(groceriesBudget as any);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 340 } } as any);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue({ id: "rem_1" } as any); // already alerted this period

    const result = await checkBudgetThreshold("budget_1", new Date("2026-07-16"));

    expect(createReminder).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("does not create a Reminder below the alert threshold", async () => {
    vi.mocked(prisma.budget.findUniqueOrThrow).mockResolvedValue(groceriesBudget as any);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 100 } } as any); // 25% of $400
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null);

    const result = await checkBudgetThreshold("budget_1", new Date("2026-07-10"));

    expect(createReminder).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("alerts every active member for a whole-household budget (memberId null)", async () => {
    vi.mocked(prisma.budget.findUniqueOrThrow).mockResolvedValue({ ...groceriesBudget, memberId: null } as any);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 340 } } as any);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.member.findMany).mockResolvedValue([{ id: "mem_1" }, { id: "mem_2" }, { id: "mem_3" }] as any);
    vi.mocked(createReminder).mockResolvedValue({ id: "rem_x" } as any);

    await checkBudgetThreshold("budget_1", new Date("2026-07-15"));

    expect(createReminder).toHaveBeenCalledTimes(3);
  });
});
```

The middle test is the one that actually earns the word "exactly" — it
proves the second sweep run, seeing an already-created Reminder for this
`(budget, period)`, makes **zero** additional calls to `createReminder`,
not just that the first run made one.

### 4.4 A smaller worked example: an `app/api/**/route.ts` Route Handler

Route Handlers get the identical integration-test treatment — mock the job
function they delegate to, assert the auth-secret check is the actual gate:

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

```ts
// src/app/api/cron/budgets-sweep/route.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { sweepBudgetThresholds } from "@/modules/finance/jobs/sweep-budgets";
import { GET } from "./route";

vi.mock("@/modules/finance/jobs/sweep-budgets", () => ({ sweepBudgetThresholds: vi.fn() }));

describe("GET /api/cron/budgets-sweep", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("rejects a request without the correct CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-secret";
    const request = new Request("http://localhost/api/cron/budgets-sweep");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(sweepBudgetThresholds).not.toHaveBeenCalled();
  });

  it("runs the sweep when the CRON_SECRET matches", async () => {
    process.env.CRON_SECRET = "test-secret";
    const request = new Request("http://localhost/api/cron/budgets-sweep", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(sweepBudgetThresholds).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });
});
```

### 4.5 The one built-in `events/` exception

Per this harness's reconciled decision (`docs/project-structure.md` §3.3,
`docs/seeding.md` §5.4): every built-in-to-built-in cross-module reaction
is a direct, permission-checked call through the dependency module's
barrel — tested exactly like any other action/job above — **except**
`kanban`'s reaction to `task.completed`. Because `dependsOnModules` only
ever runs `kanban → tasks`, `tasks` has no way to call back into `kanban`
directly when a task is completed from the plain list (not from a board),
so `tasks` emits `task.completed` as a real event and `kanban` is the only
built-in that subscribes to it. That single subscriber gets its own
colocated integration test the same way any other module reaction does:

```ts
// src/modules/kanban/events/subscribers.test.ts (excerpt — see docs/module-architecture.md §13)
it("moves a card to the first done-typed column when its task completes", async () => {
  // ...
});
it("no-ops without throwing when the completed task has no board", async () => {
  // ...
});
```

No other built-in module needs an `events/subscribers.ts` file or its test
— a 9th/custom module's genuinely optional reaction to a built-in's events
is the general case `EventSubscription` exists for (`docs/module-architecture.md`),
and follows this exact same test shape when it's added.

---

## 5. Layer 3 — Component tests

Full conventions live in `docs/ui-components.md` §12 and are restated
briefly here since this is the doc `CLAUDE.md`'s index points to for them:

- Colocated `<component>.test.tsx` next to the component
  (`task-form.tsx` → `task-form.test.tsx`), not a separate `__tests__/` tree.
- **Server Components are not unit-tested directly.** Per
  `docs/project-structure.md` §6, a page (`app/(app)/**/page.tsx`) is
  thin — it resolves the acting member and calls a query — so its
  correctness is exercised through e2e (§7), not through a component test
  that would mostly be re-asserting mocked query results.
- Only **Client Components** with real logic (a form, a drag handle, a
  toggle with its own state) earn a component test — a component that just
  renders props needs no test of its own (`docs/forms.md` §6 makes the same
  call for form components specifically).
- React Testing Library queries by role/label/accessible text
  (`getByRole("button", { name: "Add contact" })`), never by CSS class or
  snapshot — a Tailwind utility rename must never break a test.
- A form component's test asserts the *accessible* error path (an invalid
  submission surfaces the `FormMessage` text a screen reader would read),
  not just that the happy path renders and calls the action.

`docs/forms.md` §4.7's `task-form.test.tsx` is the canonical worked example
for this layer — mocking the module's own `actions/create-task` (never
`@/lib/db` directly, since a component never imports Prisma) and
asserting the rendered form calls it with the typed-in value:

```tsx
// src/modules/tasks/components/task-form.test.tsx (see docs/forms.md §4.7 in full)
vi.mock("../actions/create-task", () => ({ createTask: vi.fn().mockResolvedValue({ id: "t1" }) }));

it("calls createTask with the entered title on submit", async () => {
  render(<TaskForm members={[]} tags={[]} onDone={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Title"), "Water the plants");
  await userEvent.click(screen.getByRole("button", { name: /add task/i }));
  expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Water the plants" }));
});
```

---

## 6. Layer 4 — E2E tests

**What belongs here, and only here:** cross-module flows — the kind of
behavior that no single module's test suite can prove on its own, because
it depends on two modules' code actually working together against a real
database. Per `CLAUDE.md` rule 4 and `docs/resources.md` §2.10: a
single-module CRUD flow (create/edit/delete one `Contact`) does **not**
get a Playwright spec — its Server Action tests (§4) already cover it.
`e2e/` is reserved for flows like:

| Spec | What it proves |
|---|---|
| `e2e/invite-and-join.spec.ts` | An admin's `Invite` email round-trips through acceptance into a real, active `Member` — Household ↔ Auth ↔ session |
| `e2e/task-to-calendar.spec.ts` | A `Task`'s `dueDate` genuinely surfaces on the Calendar view with no `Event` row ever created — Tasks ↔ Calendar |
| `e2e/subscription-to-reminder.spec.ts` | A `Subscription` approaching `nextDueDate` produces a real, visible `ReminderOccurrence` — Finance ↔ Reminders |
| `e2e/module-grant-review.spec.ts` | A `pending_review` custom-module grant blocks a feature until an admin approves it under Settings → Modules, with no page reload revealing a hardcoded per-module branch anywhere — Platform ↔ everything |

This list already exists in `docs/project-structure.md` §2 and
`docs/module-architecture.md` §13 — add to it, don't fork a parallel list.

### 6.1 Test data: the seeded household, not ad hoc fixtures

E2E specs log in as one of the three seeded members from `prisma/seed/`
(`docs/seeding.md` §7) rather than creating throwaway data inline — a real
signup flow is itself covered by `invite-and-join.spec.ts`, so every other
spec starts from a known-good household:

```ts
// e2e/fixtures/login.ts
import type { Page } from "@playwright/test";

const SEED_CREDENTIALS = {
  owner: { email: "sam@seed.local", password: process.env.SEED_DEV_PASSWORD ?? "devpassword123" },
  admin: { email: "priya@seed.local", password: process.env.SEED_DEV_PASSWORD ?? "devpassword123" },
  member: { email: "jordan@seed.local", password: process.env.SEED_DEV_PASSWORD ?? "devpassword123" },
} as const;

export async function loginAs(page: Page, role: keyof typeof SEED_CREDENTIALS) {
  const { email, password } = SEED_CREDENTIALS[role];
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/dashboard");
}
```

This only works when the target environment was seeded with
`ALLOW_DEV_SEED_AUTH_USERS=true` (`docs/seeding.md` §7.1–§7.2) — CI's e2e
job runs `pnpm prisma migrate reset --force` (applies migrations, then
auto-seeds) against a disposable Postgres with that flag set, never against
a real Supabase project. `playwright.config.ts`'s `webServer.env` (§2)
is what threads the flag through to the app process Playwright boots.

### 6.2 Worked example

```ts
// e2e/task-to-calendar.spec.ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./fixtures/login";

test("a task with a due date appears on the calendar", async ({ page }) => {
  await loginAs(page, "owner");

  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Renew car registration");
  await page.getByLabel("Due date").fill("2026-08-01");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Renew car registration")).toBeVisible();

  await page.goto("/calendar");
  await page.getByRole("button", { name: "August 2026" }).click().catch(() => {}); // navigate if not already in view
  await expect(page.getByText("Renew car registration")).toBeVisible();
});
```

No `prisma.event.create` call happens anywhere in this flow — proving that
is the entire point of the spec (`plan.md` §3.2: "a due task is never
copied into an Event row").

---

## 7. Coverage checklist — is this change adequately tested?

Before opening a PR, walk whichever of these rows apply to the change:

| Change touches... | Minimum tests required |
|---|---|
| A new/changed `zod` schema or pure function in `entities/*.ts` | Unit test per branch/boundary (§3) |
| A new/changed Server Action in `actions/*.ts` | One happy-path + one rejected/unauthorized-path integration test (§4.2) |
| A new/changed query in `queries/*.ts` | A visibility/tenant-scope assertion if the entity carries `visibility` (`docs/access-control.md` §5.1's list); otherwise a plain "returns the right shape" test |
| A new/changed scheduled job in `jobs/*.ts` | Happy path, a below-threshold/no-op path, and — if the job can run more than once against the same state (a sweep) — an idempotency test (§4.3) |
| A new Route Handler in `app/api/**/route.ts` | The auth-secret rejection path + the delegate-and-succeed path (§4.4) |
| A new Client Component with its own logic in `components/*.tsx` | Accessible happy path + at least one error/edge state (§5) |
| A flow that only works because two modules cooperate | One Playwright spec in `e2e/` (§6) — confirm it doesn't already overlap an existing spec before adding a new file |

This table is the same checklist `docs/resources.md` §3 step 9 and
`AGENTS.md` §2 step 10 already point back to — one canonical list, not a
second copy per module doc.

---

## 8. Fixtures: inline first, extract only on real reuse

Every worked example above builds its fixture object (`actingMember`,
`groceriesBudget`, `SEED_CREDENTIALS`) inline, in the test file itself. Keep
it that way by default — a fixture inlined in the one test file that uses
it is easier to read than one more indirection to chase. Only factor a
fixture out into a shared file once **three or more** test files in the
same module need the identical shape, and even then it's a plain exported
`const`/factory function colocated with the module
(`src/modules/finance/test-fixtures.ts`), never a `.test.ts`-suffixed file
itself (that would make Vitest try to run it as a test suite) and never a
top-level `tests/fixtures/` folder (that would violate the colocation rule
below).

---

## 9. Known harness inconsistencies to fix, not perpetuate

Two collisions exist across already-written docs; don't copy either
inconsistent shape into new tests — follow the resolution below instead,
and fix the source doc the next time it's touched (same spirit as
`docs/orm-conventions.md`'s own top-of-file collision note).

- **Test file location.** `docs/access-control.md` §10's examples live
  under a top-level `tests/access/*.test.ts` folder
  (`tests/access/household-permissions.test.ts`,
  `tests/access/visibility.test.ts`). Every other doc — `CLAUDE.md` rule 4,
  `docs/project-structure.md` §3 and §9, `docs/forms.md`, `docs/resources.md`,
  `docs/module-architecture.md` §13, `docs/ui-components.md` §12, and this
  doc — colocates tests next to the code under test. Colocated wins: those
  two files belong at `src/lib/access/household-permissions.test.ts` and
  `src/lib/access/visibility.test.ts` (or wherever `docs/auth.md`'s
  reconciled path for that layer lands), not under a separate `tests/`
  tree, the next time `access-control.md` is touched.
- **The acting-member primitive tests mock.** `docs/auth.md` §6 defines
  `getCurrentMember()` (nullable-returning) at `@/lib/auth/current-member`,
  `docs/project-structure.md` §4 places `getCurrentMember()`/`requireMember()`
  together in `src/lib/auth/session.ts`, and `docs/access-control.md` §2
  separately defines a throwing `getActingMember()` at `lib/access/session.ts`.
  `docs/forms.md` and `docs/resources.md`'s already-committed test mocks
  (§4.1 above) target `requireMember` from `@/lib/auth/session` — **this
  doc's integration-test examples do the same**, since that's the pairing
  two independent, already-written docs agree on. Mock `getActingMember`
  from `lib/access/session` only if `docs/access-control.md` and
  `docs/auth.md` are reconciled to that name/path instead — don't mix the
  two conventions within one test file.

---

## 10. Definition of done

The testing-specific subset of `CLAUDE.md`'s full verification checklist:

```bash
pnpm test        # vitest run — unit + integration + component, no DB needed
pnpm test:e2e     # playwright test — e2e/*.spec.ts, needs a seeded Postgres + built app
```

Both are part of the full sequence `CLAUDE.md`/`docs/verify.md` require
before a change is "done":

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test:e2e` is not in that minimum-four list — it needs a running app
and a seeded database, so it's run explicitly for changes that touch a
cross-module flow (§6), and in CI as its own job rather than blocking every
commit's fast feedback loop. A change that adds or modifies one of the
flows in §6's table is not done until its `e2e/*.spec.ts` passes locally,
regardless of whether CI's e2e job is required for merge.

---

## Appendix: file map

| File | Purpose |
|---|---|
| `vitest.config.ts` | Vitest config — `jsdom` environment, `@/*` alias, excludes `e2e/` |
| `vitest.setup.ts` | `@testing-library/jest-dom` matchers |
| `playwright.config.ts` | Playwright config — `webServer`, seeded-auth env flag |
| `src/modules/<key>/entities/*.test.ts` | Unit tests — `zod` schemas, pure functions (§3) |
| `src/modules/<key>/actions/*.test.ts` | Integration tests — Server Actions, happy + rejected path (§4) |
| `src/modules/<key>/queries/*.test.ts` | Integration tests — visibility/tenant-scope assertions (§4) |
| `src/modules/<key>/jobs/*.test.ts` | Integration tests — scheduled sweeps, incl. idempotency (§4.3) |
| `src/modules/<key>/events/subscribers.test.ts` | Integration test — `kanban` only, the one built-in event-subscriber exception (§4.5) |
| `src/app/api/cron/*/route.test.ts` | Integration tests — auth-secret gate + delegate call (§4.4) |
| `src/modules/<key>/components/*.test.tsx` | Component tests — RTL, accessible queries only (§5) |
| `src/lib/prisma.test.ts` | The one test that exercises the real tenant-guard extension, not a mock of it (§2) |
| `e2e/*.spec.ts` | Playwright — cross-module flows only (§6) |
| `e2e/fixtures/login.ts` | Seeded-member login helper for e2e specs (§6.1) |
