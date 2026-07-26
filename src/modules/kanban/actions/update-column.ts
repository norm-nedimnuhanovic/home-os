"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { createColumnInputSchema, type CreateColumnFormInput } from "../entities/column";
import { getBoard } from "../queries/get-board";
import { getColumn } from "../queries/get-column";

export async function updateColumn(boardId: string, columnId: string, input: CreateColumnFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const board = await getBoard(member.householdId, boardId);
  if (board.createdById !== member.id) {
    throw new ForbiddenError("Only the board's creator can rename or retype a column.");
  }

  const existing = await getColumn(member.householdId, columnId);
  if (existing.boardId !== boardId) throw new ForbiddenError("Column does not belong to this board.");

  const data = createColumnInputSchema.parse(input);

  // columnType drives auto-completion sync independent of the display name
  // (plan.md §4.3) — renaming "Done" to "Finished" keeps working as long as
  // columnType stays "done".
  const column = await prisma.kanbanColumn.update({
    where: { id: columnId, householdId: member.householdId },
    data: { name: data.name, columnType: data.columnType },
  });

  revalidatePath(`/kanban/${boardId}`);
  return column;
}
