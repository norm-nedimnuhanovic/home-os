import { prisma } from "@/lib/db";

export async function onTaskCompleted(
  payload: { taskId: string; completedById: string },
  householdId: string,
) {
  const task = await prisma.task.findFirst({ where: { id: payload.taskId, householdId } });
  if (!task?.boardId) return; // task isn't on any board — nothing to move, not an error

  // Already sitting in *a* done-typed column — most commonly because this
  // event was emitted by move-card.ts's own completeTask() call after the
  // card was dragged directly into it. Don't override the member's explicit
  // placement by snapping it to the board's *first* done-typed column
  // instead (only relevant when a board has more than one).
  if (task.columnId) {
    const currentColumn = await prisma.kanbanColumn.findFirst({
      where: { id: task.columnId, boardId: task.boardId },
    });
    if (currentColumn?.columnType === "done") return;
  }

  const doneColumn = await prisma.kanbanColumn.findFirst({
    where: { boardId: task.boardId, columnType: "done" },
    orderBy: { position: "asc" }, // "first done-typed column" — plan.md §9 Q10
  });
  if (!doneColumn) return; // board has no done-typed column — degrade silently, per plan.md §9 Q10

  await prisma.task.update({ where: { id: task.id, householdId }, data: { columnId: doneColumn.id } });
}
