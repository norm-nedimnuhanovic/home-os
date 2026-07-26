import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getMonthlySummary } from "./get-monthly-summary";

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: { findMany: vi.fn(), aggregate: vi.fn() },
    budget: { findMany: vi.fn() },
    subscription: { count: vi.fn() },
  },
}));

describe("getMonthlySummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("totals income/expense and breaks down by category and member", async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      {
        type: "income",
        amount: 1000,
        categoryId: "cat_salary",
        category: { id: "cat_salary", name: "Salary" },
        paidById: "member_1",
        paidBy: { id: "member_1", displayName: "Sam" },
      },
      {
        type: "expense",
        amount: 200,
        categoryId: "cat_groceries",
        category: { id: "cat_groceries", name: "Groceries" },
        paidById: "member_1",
        paidBy: { id: "member_1", displayName: "Sam" },
      },
      {
        type: "expense",
        amount: 50,
        categoryId: "cat_groceries",
        category: { id: "cat_groceries", name: "Groceries" },
        paidById: "member_2",
        paidBy: { id: "member_2", displayName: "Alex" },
      },
    ] as never);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([]);
    vi.mocked(prisma.subscription.count).mockResolvedValue(2);

    const result = await getMonthlySummary("household_1", new Date("2026-08-15"));

    expect(result.totalIncome).toBe(1000);
    expect(result.totalExpense).toBe(250);
    expect(result.netBalance).toBe(750);
    expect(result.byCategoryBreakdown).toEqual(
      expect.arrayContaining([
        { categoryId: "cat_salary", category: "Salary", total: 1000 },
        { categoryId: "cat_groceries", category: "Groceries", total: 250 },
      ]),
    );
    expect(result.byMemberBreakdown).toEqual(
      expect.arrayContaining([
        { memberId: "member_1", member: "Sam", total: 1200 },
        { memberId: "member_2", member: "Alex", total: 50 },
      ]),
    );
    expect(result.subscriptionsDueCount).toBe(2);
  });

  it("computes percentUsed for each active budget against its own current period", async () => {
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);
    vi.mocked(prisma.budget.findMany).mockResolvedValue([
      { id: "budget_1", categoryId: "cat_groceries", memberId: null, period: "monthly", amount: 400, category: { name: "Groceries" } },
    ] as never);
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { amount: 100 } } as never);
    vi.mocked(prisma.subscription.count).mockResolvedValue(0);

    const result = await getMonthlySummary("household_1", new Date("2026-08-15"));

    expect(result.budgetsVsActual).toEqual([
      { budgetId: "budget_1", category: "Groceries", amountSpent: 100, amount: 400, percentUsed: 25 },
    ]);
  });
});
