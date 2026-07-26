"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { createColumnInputSchema, type CreateColumnFormInput } from "../entities/column";
import { getBoard } from "../queries/get-board";

export async function createColumn(boardId: string, input: CreateColumnFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const board = await getBoard(member.householdId, boardId);
  if (board.createdById !== member.id) {
    throw new ForbiddenError("Only the board's creator can add columns.");
  }

  const data = createColumnInputSchema.parse(input);

  const lastColumn = await prisma.kanbanColumn.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
  });

  const column = await prisma.kanbanColumn.create({
    data: {
      householdId: member.householdId,
      boardId,
      name: data.name,
      columnType: data.columnType,
      position: (lastColumn?.position ?? 0) + 1,
    },
  });

  revalidatePath(`/kanban/${boardId}`);
  return column;
}
