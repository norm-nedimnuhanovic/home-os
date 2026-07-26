"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getBoard } from "../queries/get-board";

export async function archiveBoard(boardId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getBoard(member.householdId, boardId);

  if (existing.createdById !== member.id) {
    throw new ForbiddenError("Only the board's creator can archive it.");
  }

  // Soft-archive only — columns/tasks/history preserved untouched, just
  // hidden from default views (plan.md §4.3).
  const board = await prisma.kanbanBoard.update({
    where: { id: boardId, householdId: member.householdId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/kanban");
  return board;
}
