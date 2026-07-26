"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createBoardInputSchema, type CreateBoardFormInput } from "../entities/board";
import { getBoard } from "../queries/get-board";

export async function updateBoard(boardId: string, input: CreateBoardFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getBoard(member.householdId, boardId);

  // "Manage own data" (docs/access-control.md §4.3) — a board has no
  // assignee concept the way Task does, so this is creator-only.
  if (existing.createdById !== member.id) {
    throw new ForbiddenError("Only the board's creator can edit it.");
  }

  const data = createBoardInputSchema.parse(input);

  const board = await prisma.kanbanBoard.update({
    where: { id: boardId, householdId: member.householdId },
    data: {
      name: data.name,
      description: data.description ?? null,
      visibility: data.visibility,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: "kanban",
      objectType: "KanbanBoard",
      objectId: board.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  revalidatePath("/kanban");
  revalidatePath(`/kanban/${boardId}`);
  return board;
}
