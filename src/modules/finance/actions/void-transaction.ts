"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getTransaction } from "../queries/get-transaction";

export async function voidTransaction(transactionId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getTransaction(member.householdId, transactionId);

  if (existing.paidById !== member.id) {
    throw new ForbiddenError("Only the member who paid can void this transaction.");
  }

  // plan.md §9 Q23: same block as editing — a settled split must be
  // unsettled (its Settlement undone) before this transaction can be voided.
  if (existing.splits.some((split) => split.settled)) {
    throw new ForbiddenError(
      "This transaction has settled splits — undo the settlement before voiding it.",
    );
  }

  // Soft-cancel, never a hard delete once anything could reference it
  // (plan.md §3.4).
  const transaction = await prisma.transaction.update({
    where: { id: transactionId, householdId: member.householdId },
    data: { status: "void" },
  });

  revalidatePath("/finance");
  return transaction;
}
