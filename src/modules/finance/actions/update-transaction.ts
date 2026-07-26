"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createTransactionInputSchema, type CreateTransactionFormInput } from "../entities/transaction";
import { computeEqualSplits } from "../entities/split";
import { getTransaction } from "../queries/get-transaction";

export async function updateTransaction(transactionId: string, input: CreateTransactionFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getTransaction(member.householdId, transactionId);

  // "Manage own data" (docs/access-control.md §4.3) — paidBy is this
  // entity's ownerField (docs/access-control.md §5.2).
  if (existing.paidById !== member.id) {
    throw new ForbiddenError("Only the member who paid can edit this transaction.");
  }

  // plan.md §9 Q23: block the edit if a Settlement has already been
  // recorded against any of this transaction's splits — it must be undone
  // first, rather than silently going stale.
  if (existing.splits.some((split) => split.settled)) {
    throw new ForbiddenError(
      "This transaction has settled splits — undo the settlement before editing it.",
    );
  }

  const data = createTransactionInputSchema.parse(input);

  const splits =
    data.splitType === "none"
      ? []
      : data.splitType === "equal"
        ? computeEqualSplits(data.amount, data.splitMemberIds)
        : data.splitShares;

  const transaction = await prisma.transaction.update({
    where: { id: transactionId, householdId: member.householdId },
    data: {
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      title: data.title,
      notes: data.notes ?? null,
      date: data.date,
      paidById: data.paidById,
      visibility: data.visibility,
      splitType: data.splitType,
      splits: {
        deleteMany: {},
        create: splits.map((split) => ({
          householdId: member.householdId,
          memberId: split.memberId,
          shareAmount: split.amount,
          settled: split.memberId === data.paidById,
        })),
      },
    },
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

  revalidatePath("/finance");
  return transaction;
}
