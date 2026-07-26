import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";

// The Calendar module's other data source — plan.md §4.4: "the calendar is
// a query, not a duplicated store." No Event row is ever created for a
// task; Calendar merges this with its own Event rows client-side.
export async function getTasksDueInRange(actingMember: ActingMember, from: Date, to: Date) {
  const where = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "tasks",
        objectType: "Task",
        ownerField: "createdById",
      }),
      { dueDate: { gte: from, lte: to }, archivedAt: null },
    ],
  };

  return prisma.task.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: { assignee: { select: { displayName: true } } },
  });
}
