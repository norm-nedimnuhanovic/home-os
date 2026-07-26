import { prisma } from "@/lib/db";
import { startOfMonth, endOfMonth } from "date-fns";
import { getCurrentPeriodRange } from "../entities/budget";

// MonthlySummary is a computed view, not a Prisma model (plan.md §3.4,
// docs/orm-conventions.md §7.2) — built on prisma.transaction.groupBy-style
// aggregation. budgetsVsActual deliberately reflects each budget's own live
// current period (same math as the budgets-sweep job), not an allocation of
// a weekly/yearly budget's amount into this specific calendar month — there
// is no well-defined way to prorate that, so this doesn't try to.
export async function getMonthlySummary(householdId: string, month: Date) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  const transactions = await prisma.transaction.findMany({
    where: { householdId, status: "posted", date: { gte: start, lte: end } },
    include: {
      category: { select: { id: true, name: true } },
      paidBy: { select: { id: true, displayName: true } },
    },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const byCategoryMap = new Map<string, { categoryId: string; category: string; total: number }>();
  const byMemberMap = new Map<string, { memberId: string; member: string; total: number }>();

  for (const t of transactions) {
    const amount = Number(t.amount);
    if (t.type === "income") totalIncome += amount;
    else totalExpense += amount;

    const catEntry = byCategoryMap.get(t.categoryId) ?? {
      categoryId: t.categoryId,
      category: t.category.name,
      total: 0,
    };
    catEntry.total += amount;
    byCategoryMap.set(t.categoryId, catEntry);

    const memberEntry = byMemberMap.get(t.paidById) ?? {
      memberId: t.paidById,
      member: t.paidBy.displayName,
      total: 0,
    };
    memberEntry.total += amount;
    byMemberMap.set(t.paidById, memberEntry);
  }

  const activeBudgets = await prisma.budget.findMany({
    where: {
      householdId,
      effectiveFrom: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    include: { category: { select: { name: true } } },
  });

  const budgetsVsActual = await Promise.all(
    activeBudgets.map(async (budget) => {
      const { start: periodStart, end: periodEnd } = getCurrentPeriodRange(budget.period, new Date());
      const spendResult = await prisma.transaction.aggregate({
        where: {
          householdId,
          categoryId: budget.categoryId,
          type: "expense",
          status: "posted",
          date: { gte: periodStart, lte: periodEnd },
          ...(budget.memberId ? { paidById: budget.memberId } : {}),
        },
        _sum: { amount: true },
      });
      const amountSpent = Number(spendResult._sum.amount ?? 0);
      const amount = Number(budget.amount);
      return {
        budgetId: budget.id,
        category: budget.category.name,
        amountSpent,
        amount,
        percentUsed: amount > 0 ? Math.round((amountSpent / amount) * 100) : 0,
      };
    }),
  );

  const subscriptionsDueCount = await prisma.subscription.count({
    where: { householdId, status: "active", nextDueDate: { gte: start, lte: end } },
  });

  return {
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
    byCategoryBreakdown: Array.from(byCategoryMap.values()),
    byMemberBreakdown: Array.from(byMemberMap.values()),
    budgetsVsActual,
    subscriptionsDueCount,
  };
}
