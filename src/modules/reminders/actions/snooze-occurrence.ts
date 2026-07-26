"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getOccurrence } from "../queries/get-occurrence";
import { emitReminderSnoozed } from "../events/emitters";

export async function snoozeOccurrence(occurrenceId: string, snoozedUntil: Date) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  if (snoozedUntil <= new Date()) {
    throw new Error("Snooze time must be in the future.");
  }

  const existing = await getOccurrence(member.householdId, occurrenceId);

  // Acknowledgement is the target member's call only (plan.md §4.5) — even
  // the reminder's own creator can't snooze it on someone else's behalf.
  if (existing.reminder.targetMemberId !== member.id) {
    throw new ForbiddenError("Only this reminder's target can snooze it.");
  }

  // The same occurrence row is reused, not a new one (plan.md §3.3) —
  // snoozedUntil becomes the next remindAt once it elapses.
  const occurrence = await prisma.reminderOccurrence.update({
    where: { id: occurrenceId, householdId: member.householdId },
    data: {
      status: "snoozed",
      snoozedUntil,
      snoozeCount: { increment: 1 },
      acknowledgedAt: new Date(),
    },
  });

  await emitReminderSnoozed(member.householdId, existing.reminderId, occurrence.id, member.id);

  revalidatePath("/reminders");
  return occurrence;
}
