import { emitEvent } from "@/lib/events/emit";

export async function emitReminderCreated(householdId: string, reminderId: string, byMemberId: string) {
  return emitEvent(householdId, "reminder.created", { reminderId }, byMemberId);
}

export async function emitReminderSnoozed(
  householdId: string,
  reminderId: string,
  occurrenceId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "reminder.snoozed", { reminderId, occurrenceId }, byMemberId);
}

export async function emitReminderCompleted(
  householdId: string,
  reminderId: string,
  occurrenceId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "reminder.completed", { reminderId, occurrenceId }, byMemberId);
}

export async function emitReminderCancelled(householdId: string, reminderId: string, byMemberId: string) {
  return emitEvent(householdId, "reminder.cancelled", { reminderId }, byMemberId);
}
