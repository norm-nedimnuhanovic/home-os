import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";

export async function getVisibleTasks(
  actingMember: ActingMember,
  filters: { assigneeId?: string; boardId?: string; completed?: boolean; dueBefore?: Date } = {},
) {
  const where: Prisma.TaskWhereInput = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "tasks",
        objectType: "Task",
        ownerField: "createdById",
      }),
      {
        archivedAt: null,
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.boardId ? { boardId: filters.boardId } : {}),
        ...(filters.completed === false ? { completedAt: null } : {}),
        ...(filters.completed === true ? { completedAt: { not: null } } : {}),
        // Dashboard's "Today" view (plan.md §4.1): overdue-or-due-today,
        // open-ended below so a task overdue by weeks still surfaces — not
        // just a same-day window. `lte` alone already excludes null
        // dueDate rows (SQL: a NULL never satisfies "<=", so those rows
        // just don't match — no separate `not: null` needed).
        ...(filters.dueBefore ? { dueDate: { lte: filters.dueBefore } } : {}),
      },
    ],
  };

  return prisma.task.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: {
      assignee: { select: { displayName: true } },
      tags: { select: { tagId: true } },
      // The task's own "remind me before due date" reminder, if any — at
      // most one live (active/paused) Reminder per task in practice
      // (regenerateTaskDueReminder() cancels the old one before creating a
      // new one), so the edit form can pre-fill remindBeforeDue/lead time.
      reminders: {
        where: { sourceType: "task", status: { in: ["active", "paused"] } },
        select: { leadTimeValue: true, leadTimeUnit: true },
        take: 1,
      },
    },
  });
}
