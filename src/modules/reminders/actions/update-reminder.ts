"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { createManualReminderInputSchema, type CreateManualReminderFormInput } from "../entities/reminder";
import { getReminder } from "../queries/get-reminder";

export async function updateReminder(reminderId: string, input: CreateManualReminderFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getReminder(member.householdId, reminderId);

  // "Manage own data + assigned items" (CLAUDE.md rule 1 / docs/access-
  // control.md §4.3) — the creator or the reminder's own target can edit it.
  const isOwner = existing.createdByMemberId === member.id;
  const isTarget = existing.targetMemberId === member.id;
  if (!isOwner && !isTarget) {
    throw new ForbiddenError("You can only edit reminders you created or are the target of.");
  }

  const data = createManualReminderInputSchema.parse(input);

  const target = await prisma.member.findFirst({
    where: { id: data.targetMemberId, householdId: member.householdId },
  });
  if (!target) throw new Error("Target member not found in this household.");

  const reminder = await prisma.reminder.update({
    where: { id: reminderId, householdId: member.householdId },
    data: {
      title: data.title,
      description: data.description ?? null,
      targetMemberId: data.targetMemberId,
      reminderType: data.reminderType,
      firstRemindAt: data.firstRemindAt,
      recurrenceFrequency: data.recurrenceFrequency ?? null,
      recurrenceInterval: data.recurrenceInterval,
      recurrenceEndDate: data.recurrenceEndDate ?? null,
      emailEnabled: data.emailEnabled,
    },
  });

  revalidatePath("/reminders");
  return reminder;
}
