"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/access/errors";
import { completeTask, reopenTask } from "@/modules/tasks";
import { moveCardInputSchema, type MoveCardInput } from "../entities/column";
import { getColumn } from "../queries/get-column";

export async function moveCard(input: MoveCardInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = moveCardInputSchema.parse(input);

  const column = await getColumn(member.householdId, data.columnId);

  const task = await prisma.task.findFirst({
    where: { id: data.taskId, householdId: member.householdId },
  });
  if (!task) throw new NotFoundError("Task not found.");

  // Positioned first: if this lands in a done-typed column, the
  // completeTask() call below emits task.completed, which Kanban's own
  // onTaskCompleted subscriber reacts to (docs/module-architecture.md §7.1).
  // That subscriber checks the card's *current* column before moving it —
  // doing the position write first means it sees the card already correctly
  // placed and doesn't snap it to the board's first done-typed column instead.
  await prisma.task.update({
    where: { id: task.id, householdId: member.householdId },
    data: { boardId: column.boardId, columnId: column.id, boardPosition: data.boardPosition },
  });

  // Kanban ↔ completion sync (plan.md §4.3): entering a done-typed column
  // completes the task; leaving one reopens it. Calling the real tasks
  // actions (not a raw prisma write) keeps notifications/events consistent
  // regardless of whether a task was completed from its card or the list.
  if (column.columnType === "done" && !task.completedAt) {
    await completeTask(task.id);
  } else if (column.columnType !== "done" && task.completedAt) {
    await reopenTask(task.id);
  }

  revalidatePath(`/kanban/${column.boardId}`);
}
