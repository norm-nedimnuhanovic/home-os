import "server-only";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import type { Renewal } from "@prisma/client";

// Cancels this renewal's existing Reminders directly via Prisma rather than
// calling reminders' user-facing cancelReminder() action — that action
// requires the acting member to be the reminder's own createdByMemberId or
// targetMemberId, which doesn't hold in general here (Renewal editing is
// gated to creator-or-responsibleMember, not tied to who happened to be
// acting when the reminder was first generated). This is a system-level
// "these reminders no longer apply," fully householdId+sourceEntityId
// scoped, not a per-member cancellation.
export async function cancelRenewalReminders(renewal: Pick<Renewal, "id" | "householdId">) {
  const existingReminders = await prisma.reminder.findMany({
    where: {
      householdId: renewal.householdId,
      sourceType: "renewal",
      sourceEntityId: renewal.id,
      status: { in: ["active", "paused"] },
    },
    select: { id: true },
  });
  if (existingReminders.length === 0) return;

  const reminderIds = existingReminders.map((r) => r.id);
  await prisma.reminder.updateMany({
    where: { householdId: renewal.householdId, id: { in: reminderIds } },
    data: { status: "cancelled" },
  });
  await prisma.reminderOccurrence.updateMany({
    where: {
      householdId: renewal.householdId,
      reminderId: { in: reminderIds },
      status: { in: ["pending", "notified", "snoozed"] },
    },
    data: { status: "dismissed" },
  });
}

// plan.md §4.8: "changing expiryDate/reminderOffsetsDays regenerates the
// associated reminders (old ones cancelled) to avoid duplicate emails."
export async function regenerateRenewalReminders(
  renewal: Pick<
    Renewal,
    "id" | "householdId" | "title" | "expiryDate" | "reminderOffsetsDays" | "responsibleMemberId" | "createdById"
  >,
  actingMemberId: string,
) {
  await cancelRenewalReminders(renewal);

  const targetMemberId = renewal.responsibleMemberId ?? renewal.createdById;

  for (const offsetDays of renewal.reminderOffsetsDays) {
    const remindAt = new Date(renewal.expiryDate);
    remindAt.setDate(remindAt.getDate() - offsetDays);

    await createReminder({
      householdId: renewal.householdId,
      title: `${renewal.title} expires ${offsetDays === 0 ? "today" : `in ${offsetDays} day${offsetDays === 1 ? "" : "s"}`}`,
      targetMemberId,
      createdByMemberId: actingMemberId,
      sourceType: "renewal",
      sourceModule: "life_admin",
      sourceEntityId: renewal.id,
      firstRemindAt: remindAt,
    });
  }
}
