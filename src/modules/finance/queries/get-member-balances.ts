import { prisma } from "@/lib/db";

export type MemberBalance = { memberAId: string; memberBId: string; netAmount: number };

// MemberBalance is a computed view, not a Prisma model (plan.md §3.4) —
// purely derived from unsettled TransactionSplit shares (linked
// settlements already flip a split to settled, so they're excluded simply
// by querying settled: false) plus free-standing Settlements (appliesTo
// empty — a manual balance adjustment not tied to any specific
// transaction). Never edited directly; reconstructable from history.
//
// netAmount > 0 means memberAId owes memberBId; netAmount < 0 means the
// reverse — memberA/memberB are whichever of the pair sorts first, so the
// sign is the only thing that carries meaning, not which one is "A".
export async function getMemberBalances(householdId: string): Promise<MemberBalance[]> {
  const pairBalances = new Map<string, number>();

  function addToPair(debtorId: string, creditorId: string, amount: number) {
    if (debtorId === creditorId) return;
    const [a, b] = [debtorId, creditorId].sort();
    const key = `${a}:${b}`;
    const sign = debtorId === a ? 1 : -1; // positive = a owes b
    pairBalances.set(key, (pairBalances.get(key) ?? 0) + amount * sign);
  }

  const unsettledSplits = await prisma.transactionSplit.findMany({
    where: { householdId, settled: false },
    include: { transaction: { select: { paidById: true } } },
  });
  for (const split of unsettledSplits) {
    addToPair(split.memberId, split.transaction.paidById, Number(split.shareAmount));
  }

  const freeStandingSettlements = await prisma.settlement.findMany({
    where: { householdId, status: "recorded", appliesTo: { none: {} } },
  });
  for (const settlement of freeStandingSettlements) {
    // fromMember paid toMember, so fromMember's debt to toMember shrinks —
    // the opposite direction of a debt accruing.
    addToPair(settlement.toMemberId, settlement.fromMemberId, Number(settlement.amount));
  }

  return Array.from(pairBalances.entries())
    .map(([key, netAmount]) => {
      const [memberAId, memberBId] = key.split(":");
      return { memberAId, memberBId, netAmount: Math.round(netAmount * 100) / 100 };
    })
    .filter((b) => b.netAmount !== 0);
}
