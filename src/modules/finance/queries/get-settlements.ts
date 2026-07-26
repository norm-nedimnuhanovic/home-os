import { prisma } from "@/lib/db";

// Settlement has no visibility column — a ledger record between two
// members, visible to the whole household like Budget/Subscription/Category
// (docs/access-control.md §5.1's list excludes it).
export async function getSettlements(householdId: string) {
  return prisma.settlement.findMany({
    where: { householdId },
    orderBy: { date: "desc" },
    include: {
      fromMember: { select: { displayName: true } },
      toMember: { select: { displayName: true } },
    },
  });
}
