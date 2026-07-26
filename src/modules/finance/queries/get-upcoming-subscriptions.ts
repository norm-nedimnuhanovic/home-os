import { prisma } from "@/lib/db";

// Dashboard's "Today" view (plan.md §4.1, §9 Q32): active subscriptions due
// within a fixed lookahead window — 7 days, not per-member configurable.
// No lower bound on nextDueDate — "not yet paid for the current cycle"
// (plan.md) also surfaces one that's already overdue, the same
// overdue-inclusive shape as Tasks' own due-today view. Subscription has no
// visibility column (household-wide, like Category/Budget), so no
// visibilityWhere() call is needed here.
export async function getUpcomingSubscriptions(householdId: string, lookaheadDays: number, asOf: Date = new Date()) {
  const to = new Date(asOf);
  to.setDate(to.getDate() + lookaheadDays);

  return prisma.subscription.findMany({
    where: { householdId, status: "active", nextDueDate: { lte: to } },
    orderBy: { nextDueDate: "asc" },
    include: { responsibleMember: { select: { displayName: true } } },
  });
}
