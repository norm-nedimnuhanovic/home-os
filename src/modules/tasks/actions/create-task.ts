"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createTaskInputSchema, type CreateTaskFormInput } from "../entities/task";
import { emitTaskAssigned } from "../events/emitters";
import { regenerateTaskDueReminder } from "./regenerate-task-due-reminder";

export async function createTask(input: CreateTaskFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // Re-parse even though react-hook-form already validated this schema
  // client-side — a Server Action is callable directly with crafted
  // arguments (docs/access-control.md §1); never skip this.
  const data = createTaskInputSchema.parse(input);

  const task = await prisma.task.create({
    data: {
      householdId: member.householdId,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.dueDate ?? null,
      dueDateAllDay: data.dueDateAllDay,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      parentTaskId: data.parentTaskId ?? null,
      visibility: data.visibility,
      createdById: member.id,
      tags: {
        // TaskTag carries householdId denormalized even though it's
        // derivable from Task — docs/orm-conventions.md §3.1
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

  if (task.assigneeId) {
    await emitTaskAssigned(member.householdId, task.id, task.assigneeId, member.id);
  }

  if (data.remindBeforeDue) {
    await regenerateTaskDueReminder(task, true, data.remindLeadTimeValue, data.remindLeadTimeUnit, member.id);
  }

  revalidatePath("/tasks");
  return task;
}
