import { emitEvent } from "@/lib/events/emit";

export async function emitTaskAssigned(
  householdId: string,
  taskId: string,
  assigneeId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "task.assigned", { taskId, assigneeId }, byMemberId);
}

export async function emitTaskCompleted(
  householdId: string,
  taskId: string,
  completedById: string,
) {
  return emitEvent(householdId, "task.completed", { taskId, completedById }, completedById);
}
