import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { getTasksDueInRange } from "@/modules/tasks";
import type { ActingMember } from "@/lib/auth/session";

// plan.md §4.4: "the calendar is a query, not a duplicated store." Merges
// this module's own Event rows with Tasks' due-date rows for the same
// range — no Event row is ever created for a task.
export async function getCalendarRange(actingMember: ActingMember, from: Date, to: Date) {
  const where = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "calendar",
        objectType: "Event",
        ownerField: "createdById",
      }),
      {
        // Overlapping the range, not just starting inside it — a multi-day
        // event that starts before `from` but ends within range must still
        // render.
        startAt: { lte: to },
        endAt: { gte: from },
      },
    ],
  };

  const [events, tasks] = await Promise.all([
    prisma.event.findMany({ where, orderBy: { startAt: "asc" } }),
    getTasksDueInRange(actingMember, from, to),
  ]);

  return { events, tasks };
}
