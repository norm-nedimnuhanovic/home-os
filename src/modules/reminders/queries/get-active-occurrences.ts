import { prisma } from "@/lib/db";

// The "active reminders" surface for the Today dashboard (docs/project-
// structure.md §3.1's getActiveReminderOccurrences) and this module's own
// page — every occurrence still awaiting the target member's acknowledgement.
export async function getActiveReminderOccurrences(householdId: string, memberId: string) {
  return prisma.reminderOccurrence.findMany({
    where: {
      householdId,
      status: { in: ["pending", "notified", "snoozed"] },
      reminder: { targetMemberId: memberId },
    },
    orderBy: { remindAt: "asc" },
    include: { reminder: true },
  });
}
