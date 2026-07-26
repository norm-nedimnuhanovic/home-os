import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getTask(householdId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, householdId }, // both, always — not just id
  });
  if (!task) throw new NotFoundError("Task not found.");
  return task;
}
