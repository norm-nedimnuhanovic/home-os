"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createTaskInputSchema, type CreateTaskFormInput } from "../entities/task";
import { getTask } from "../queries/get-task";
import { regenerateTaskDueReminder } from "./regenerate-task-due-reminder";

export async function updateTask(taskId: string, input: CreateTaskFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // Load through getTask first — both householdId and id, never id alone
  // (CLAUDE.md rule 1) — throws NotFoundError if it's in another household
  // or this member has no visibility into it.
  const existing = await getTask(member.householdId, taskId);

  // "Manage own data + assigned items" (docs/access-control.md §4.3): being
  // able to see the task isn't enough to edit it — only the creator or the
  // assignee can.
  const isOwner = existing.createdById === member.id;
  const isAssignee = existing.assigneeId === member.id;
  if (!isOwner && !isAssignee) {
    throw new ForbiddenError("You can only edit tasks you created or are assigned to.");
  }

  // Re-parse even though react-hook-form already validated this schema
  // client-side — a Server Action is callable directly with crafted
  // arguments (docs/access-control.md §1); never skip this.
  const data = createTaskInputSchema.parse(input);

  // The edit form is always pre-filled with the task's full current values
  // (docs/forms.md §1), so this is a full replace, not a partial patch.
  const task = await prisma.task.update({
    where: { id: taskId, householdId: member.householdId },
    data: {
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      dueDateAllDay: data.dueDateAllDay,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      visibility: data.visibility,
      tags: {
        deleteMany: {},
        create: data.tagIds.map((tagId) => ({ tagId, householdId: member.householdId })),
      },
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: "tasks",
      objectType: "Task",
      objectId: task.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  // Always regenerate (cancel-and-recreate), same shape as Life Admin's
  // regenerateRenewalReminders() — dueDate/assignee/lead-time may all have
  // changed, and cancelling a reminder that never existed is a harmless
  // no-op.
  await regenerateTaskDueReminder(task, data.remindBeforeDue, data.remindLeadTimeValue, data.remindLeadTimeUnit, member.id);

  revalidatePath("/tasks");
  return task;
}
