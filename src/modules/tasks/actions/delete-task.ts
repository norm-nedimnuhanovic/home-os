"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getTask } from "../queries/get-task";
import { cancelTaskDueReminder } from "./regenerate-task-due-reminder";

// A soft archive, never a real prisma.task.delete() — same reversible shape
// as KanbanBoard.archivedAt, so tags/sub-tasks/NoteLinks/kanban-card
// placement never dangle a broken reference. Same auth gate as updateTask
// (creator-or-assignee, docs/access-control.md §4.3): this is a reversible
// hide, not Document's stricter "most sensitive category" delete, so it
// doesn't need updateTask's stricter admin/owner-only sibling.
export async function deleteTask(taskId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getTask(member.householdId, taskId);

  const isOwner = existing.createdById === member.id;
  const isAssignee = existing.assigneeId === member.id;
  if (!isOwner && !isAssignee) {
    throw new ForbiddenError("You can only delete tasks you created or are assigned to.");
  }

  const task = await prisma.task.update({
    where: { id: taskId, householdId: member.householdId },
    data: { archivedAt: new Date() },
  });

  await cancelTaskDueReminder(task);

  revalidatePath("/tasks");
  return task;
}
