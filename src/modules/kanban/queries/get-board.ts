import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getBoard(householdId: string, boardId: string) {
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, householdId }, // both, always — not just id
  });
  if (!board) throw new NotFoundError("Board not found.");
  return board;
}
