import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import type { TransactionType, TransactionStatus } from "@prisma/client";

export async function getVisibleTransactions(
  actingMember: ActingMember,
  filters: {
    categoryId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    from?: Date;
    to?: Date;
  } = {},
) {
  const where = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "finance",
        objectType: "Transaction",
        ownerField: "paidById",
      }),
      {
        status: filters.status ?? "posted",
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? { date: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
          : {}),
      },
    ],
  };

  return prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      category: true,
      paidBy: { select: { displayName: true } },
      splits: true,
    },
  });
}
