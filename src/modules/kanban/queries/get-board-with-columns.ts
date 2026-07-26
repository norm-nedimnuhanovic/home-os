import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";

export async function getBoardWithColumns(actingMember: ActingMember, boardId: string) {
  const board = await prisma.kanbanBoard.findFirst({
    where: {
      AND: [
        await visibilityWhere(actingMember, {
          moduleKey: "kanban",
          objectType: "KanbanBoard",
          ownerField: "createdById",
        }),
        { id: boardId },
      ],
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  if (!board) throw new NotFoundError("Board not found.");

  // Cards inherit their own Task's visibility independently of the board's —
  // a household-visible board must not leak another member's private task.
  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        await visibilityWhere(actingMember, {
          moduleKey: "tasks",
          objectType: "Task",
          ownerField: "createdById",
        }),
        { boardId: board.id, archivedAt: null },
      ],
    },
    orderBy: { boardPosition: "asc" },
    include: { assignee: { select: { displayName: true } } },
  });

  return { ...board, tasks };
}
