"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createSettlementInputSchema, type CreateSettlementFormInput } from "../entities/settlement";
import { emitSettlementRecorded } from "../events/emitters";

export async function createSettlement(input: CreateSettlementFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createSettlementInputSchema.parse(input);

  const [fromMember, toMember] = await Promise.all([
    prisma.member.findFirst({ where: { id: data.fromMemberId, householdId: member.householdId } }),
    prisma.member.findFirst({ where: { id: data.toMemberId, householdId: member.householdId } }),
  ]);
  if (!fromMember || !toMember) throw new Error("Both members must belong to this household.");

  // The specific outstanding splits this clears must actually be owed by
  // fromMember to toMember — never trust client-supplied ids alone
  // (CLAUDE.md rule 1).
  const splitsToSettle =
    data.appliesToSplitIds.length > 0
      ? await prisma.transactionSplit.findMany({
          where: {
            id: { in: data.appliesToSplitIds },
            householdId: member.householdId,
            memberId: data.fromMemberId,
            settled: false,
            transaction: { paidById: data.toMemberId },
          },
        })
      : [];

  const settlement = await prisma.settlement.create({
    data: {
      householdId: member.householdId,
      fromMemberId: data.fromMemberId,
      toMemberId: data.toMemberId,
      amount: data.amount,
      date: data.date,
      method: data.method ?? null,
      note: data.note ?? null,
      appliesTo: { connect: splitsToSettle.map((split) => ({ id: split.id })) },
    },
  });

  if (splitsToSettle.length > 0) {
    await prisma.transactionSplit.updateMany({
      where: { id: { in: splitsToSettle.map((s) => s.id) }, householdId: member.householdId },
      data: { settled: true, settledById: settlement.id },
    });
  }

  await emitSettlementRecorded(member.householdId, settlement.id, member.id);

  revalidatePath("/finance/settlements");
  return settlement;
}
