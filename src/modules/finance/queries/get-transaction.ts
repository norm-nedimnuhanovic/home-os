import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getTransaction(householdId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, householdId }, // both, always — not just id
    include: { splits: true, category: true },
  });
  if (!transaction) throw new NotFoundError("Transaction not found.");
  return transaction;
}
