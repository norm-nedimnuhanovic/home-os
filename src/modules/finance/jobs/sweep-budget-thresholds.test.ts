import { beforeEach, describe, expect, it, vi } from "vitest";
import { sweepBudgetThresholds } from "./sweep-budget-thresholds";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { emitBudgetThresholdExceeded } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: {
    household: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    transaction: { aggregate: vi.fn() },
    reminder: { findFirst: vi.fn() },
    member: { findMany: vi.fn() },
  },
}));
vi.mock("@/modules/reminders", () => ({ createReminder: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitBudgetThresholdExceeded: vi.fn() }));

const budget = {
  id: "budget_1",
  householdId: "household_1",
  categoryId: "cat_1",
  memberId: null,
  period: "monthly" as const,
  amount: 400,
  alertThresholdPercent: 80,
  category: { name: "Groceries" },
};

describe("sweepBudgetThresholds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "household_1" }] as never);
  });

  it("does nothing when spend is under the alert threshold", async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([budget] as never);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 100 } } as never);

    await sweepBudgetThresholds();

    expect(createReminder).not.toHaveBeenCalled();
  });

  it("creates a Reminder for every active member when a whole-household budget crosses its threshold", async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([budget] as never);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 350 } } as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.member.findMany).mockResolvedValue([
      { id: "member_1" },
      { id: "member_2" },
    ] as never);

    await sweepBudgetThresholds();

    expect(createReminder).toHaveBeenCalledTimes(2);
    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: "household_1",
        targetMemberId: "member_1",
        sourceType: "budget",
        sourceEntityId: "budget_1",
      }),
    );
    expect(emitBudgetThresholdExceeded).toHaveBeenCalledWith("household_1", "budget_1");
  });

  it("only alerts the budget's own member for a personal budget", async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      { ...budget, memberId: "member_1" },
    ] as never);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 350 } } as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null);

    await sweepBudgetThresholds();

    expect(createReminder).toHaveBeenCalledTimes(1);
    expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ targetMemberId: "member_1" }));
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it("doesn't re-fire when a Reminder was already created for this period (idempotency)", async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([budget] as never);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 350 } } as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue({ id: "reminder_existing" } as never);

    await sweepBudgetThresholds();

    expect(createReminder).not.toHaveBeenCalled();
    expect(emitBudgetThresholdExceeded).not.toHaveBeenCalled();
  });
});
