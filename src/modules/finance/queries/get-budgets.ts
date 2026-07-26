import { prisma } from "@/lib/db";

// Budget has no visibility column — household-wide, same rule as Category
// (docs/access-control.md §5.1's list excludes it), even a "personal"
// budget (memberId set) is just scoped spending tracking, not private data.
export async function getBudgets(householdId: string) {
  return prisma.budget.findMany({
    where: { householdId },
    orderBy: { effectiveFrom: "desc" },
    include: { category: true, member: { select: { displayName: true } } },
  });
}
