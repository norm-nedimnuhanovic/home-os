"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getReminder } from "../queries/get-reminder";
import { emitReminderCancelled } from "../events/emitters";

export async function cancelReminder(reminderId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getReminder(member.householdId, reminderId);

  const isOwner = existing.createdByMemberId === member.id;
  const isTarget = existing.targetMemberId === member.id;
  if (!isOwner && !isTarget) {
    throw new ForbiddenError("You can only cancel reminders you created or are the target of.");
  }

  const reminder = await prisma.reminder.update({
    where: { id: reminderId, householdId: member.householdId },
    data: { status: "cancelled" },
  });

  // A cancelled reminder shouldn't keep showing as active — dismiss
  // whatever occurrence is still pending/notified/snoozed.
  await prisma.reminderOccurrence.updateMany({
    where: { householdId: member.householdId, reminderId, status: { in: ["pending", "notified", "snoozed"] } },
    data: { status: "dismissed" },
  });

  await emitReminderCancelled(member.householdId, reminder.id, member.id);

  revalidatePath("/reminders");
  return reminder;
}
