"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createTransactionInputSchema, type CreateTransactionFormInput } from "../entities/transaction";
import { computeEqualSplits } from "../entities/split";
import { emitTransactionRecorded } from "../events/emitters";

export async function createTransaction(input: CreateTransactionFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createTransactionInputSchema.parse(input);

  const splits =
    data.splitType === "none"
      ? []
      : data.splitType === "equal"
        ? computeEqualSplits(data.amount, data.splitMemberIds)
        : data.splitShares;

  const transaction = await prisma.transaction.create({
    data: {
      householdId: member.householdId,
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      title: data.title,
      notes: data.notes ?? null,
      date: data.date,
      paidById: data.paidById,
      visibility: data.visibility,
      splitType: data.splitType,
      // The payer's own split is auto-settled at creation (plan.md §3.4) —
      // they already paid, so there's no debt on their own share.
      splits: {
        create: splits.map((split) => ({
          householdId: member.householdId,
          memberId: split.memberId,
          shareAmount: split.amount,
          settled: split.memberId === data.paidById,
        })),
      },
    },
    include: { splits: true },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: "finance",
      objectType: "Transaction",
      objectId: transaction.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  await emitTransactionRecorded(member.householdId, transaction.id, member.id);

  revalidatePath("/finance");
  return transaction;
}
