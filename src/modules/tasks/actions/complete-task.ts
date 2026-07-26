"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { emitTaskCompleted } from "../events/emitters";
import { cancelTaskDueReminder } from "./regenerate-task-due-reminder";

export async function completeTask(taskId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const task = await prisma.task.update({
    where: { id: taskId, householdId: member.householdId }, // both, always — never id alone
    data: { completedAt: new Date(), completedById: member.id },
  });

  // No point reminding about a task that's already done — a no-op if this
  // task never had a "remind before due" reminder in the first place.
  await cancelTaskDueReminder(task);

  await emitTaskCompleted(member.householdId, task.id, member.id);

  revalidatePath("/tasks");
  return task;
}
