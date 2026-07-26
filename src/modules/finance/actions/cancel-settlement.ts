"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/access/errors";

export async function cancelSettlement(settlementId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await prisma.settlement.findFirst({
    where: { id: settlementId, householdId: member.householdId }, // both, always — not just id
  });
  if (!existing) throw new NotFoundError("Settlement not found.");

  if (existing.fromMemberId !== member.id && existing.toMemberId !== member.id) {
    throw new ForbiddenError("Only a party to this settlement can cancel it.");
  }

  // Cancellation preserves audit trail instead of deletion (plan.md §3.4) —
  // and the splits it cleared revert to unsettled, since a cancelled
  // settlement no longer counts as clearing the balance (MemberBalance is
  // always derived, never a mutable running total).
  const [settlement] = await prisma.$transaction([
    prisma.settlement.update({
      where: { id: settlementId, householdId: member.householdId },
      data: { status: "cancelled" },
    }),
    prisma.transactionSplit.updateMany({
      where: { householdId: member.householdId, settledById: settlementId },
      data: { settled: false, settledById: null },
    }),
  ]);

  revalidatePath("/finance/settlements");
  return settlement;
}
