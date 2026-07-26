import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getColumn(householdId: string, columnId: string) {
  const column = await prisma.kanbanColumn.findFirst({
    where: { id: columnId, householdId }, // both, always — not just id
  });
  if (!column) throw new NotFoundError("Column not found.");
  return column;
}
