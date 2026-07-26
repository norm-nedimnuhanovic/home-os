"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { completeTask } from "@/modules/tasks";
import { createCardInputSchema, type CreateCardInput } from "../entities/card";
import { getColumn } from "../queries/get-column";

// The one path that puts a Task onto a board for the first time — every
// other Kanban action (move-card, delete-column) only ever repositions or
// unplaces a card that's already there. A board with columns but no way to
// add a card to them wouldn't be a usable board.
export async function createCard(boardId: string, columnId: string, input: CreateCardInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const column = await getColumn(member.householdId, columnId);
  if (column.boardId !== boardId) {
    throw new ForbiddenError("Column does not belong to this board.");
  }

  const data = createCardInputSchema.parse(input);

  const lastTask = await prisma.task.findFirst({
    where: { householdId: member.householdId, columnId },
    orderBy: { boardPosition: "desc" },
  });

  const task = await prisma.task.create({
    data: {
      householdId: member.householdId,
      title: data.title,
      priority: "medium",
      dueDateAllDay: true,
      visibility: "household",
      createdById: member.id,
      boardId,
      columnId,
      boardPosition: (lastTask?.boardPosition ?? 0) + 1,
    },
  });

  // Rare edge case, but consistent with move-card.ts: a card created
  // straight into a done-typed column starts completed (plan.md §4.3).
  if (column.columnType === "done") {
    await completeTask(task.id);
  }

  revalidatePath(`/kanban/${boardId}`);
  return task;
}
