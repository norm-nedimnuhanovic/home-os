import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";

export async function getBoards(actingMember: ActingMember) {
  const where = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "kanban",
        objectType: "KanbanBoard",
        ownerField: "createdById",
      }),
      { archivedAt: null },
    ],
  };

  return prisma.kanbanBoard.findMany({
    where,
    orderBy: { position: "asc" },
  });
}
