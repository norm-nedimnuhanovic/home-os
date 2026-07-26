"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getBoard } from "../queries/get-board";
import { getColumn } from "../queries/get-column";

export async function deleteColumn(boardId: string, columnId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const board = await getBoard(member.householdId, boardId);
  if (board.createdById !== member.id) {
    throw new ForbiddenError("Only the board's creator can delete a column.");
  }

  const existing = await getColumn(member.householdId, columnId);
  if (existing.boardId !== boardId) throw new ForbiddenError("Column does not belong to this board.");

  // Cards in a deleted column become unplaced, not reassigned to another
  // column or deleted — "a task with no board still lives normally in the
  // task list, calendar, and dashboard" (plan.md §3.2).
  await prisma.task.updateMany({
    where: { householdId: member.householdId, columnId },
    data: { boardId: null, columnId: null, boardPosition: null },
  });

  await prisma.kanbanColumn.delete({ where: { id: columnId, householdId: member.householdId } });

  revalidatePath(`/kanban/${boardId}`);
}
