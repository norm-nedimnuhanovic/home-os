"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";

// The reverse of completeTask() — used when Kanban moves a card's column out
// of a done-typed one (plan.md §4.3: "moving it out clears completedAt").
// No event emitted: there's no task.reopened ModuleEventType declared, and
// nothing in V1 needs to react to a reopen.
export async function reopenTask(taskId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const task = await prisma.task.update({
    where: { id: taskId, householdId: member.householdId }, // both, always — never id alone
    data: { completedAt: null, completedById: null },
  });

  revalidatePath("/tasks");
  return task;
}
