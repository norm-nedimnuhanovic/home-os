"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getOccurrence } from "../queries/get-occurrence";
import { emitReminderCompleted } from "../events/emitters";
import { generateNextOccurrenceIfDue } from "./generate-next-occurrence";

export async function completeOccurrence(occurrenceId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getOccurrence(member.householdId, occurrenceId);

  if (existing.reminder.targetMemberId !== member.id) {
    throw new ForbiddenError("Only this reminder's target can complete it.");
  }

  const occurrence = await prisma.reminderOccurrence.update({
    where: { id: occurrenceId, householdId: member.householdId },
    data: { status: "completed", acknowledgedAt: new Date() },
  });

  // completed is a terminal state — a recurring reminder's next occurrence
  // is generated lazily right here (plan.md §3.3/§4.5).
  await generateNextOccurrenceIfDue(existing.reminder, occurrence);

  await emitReminderCompleted(member.householdId, existing.reminderId, occurrence.id, member.id);

  revalidatePath("/reminders");
  return occurrence;
}
