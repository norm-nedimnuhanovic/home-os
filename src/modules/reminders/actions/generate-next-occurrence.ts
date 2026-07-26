import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { prisma } from "@/lib/db";
import type { Reminder, ReminderOccurrence } from "@prisma/client";

const ADD_BY_FREQUENCY: Record<string, (date: Date, amount: number) => Date> = {
  daily: addDays,
  weekly: addWeeks,
  monthly: addMonths,
  yearly: addYears,
};

/**
 * plan.md §3.3/§4.5: "only one occurrence is ever live (pending/notified/
 * snoozed) per reminder at a time — the next is generated lazily once the
 * current one reaches a terminal state, capped by recurrenceEndDate/
 * recurrenceCount." Call this after an occurrence transitions to
 * dismissed/completed/missed — never after snoozed (that reuses the same
 * row, plan.md §3.3) and never for a one_off reminder.
 *
 * recurrenceDaysOfWeek is deliberately not consulted here — no real UI path
 * (create-manual-reminder's form, updateReminder()) ever sets it, and no
 * format for it was ever established; treating it as reserved/unused
 * matches the same "schema column exists, feature was never built" gap as
 * TaskRecurrenceRule (ROADMAP.md).
 */
export async function generateNextOccurrenceIfDue(reminder: Reminder, terminatedOccurrence: ReminderOccurrence) {
  if (reminder.reminderType !== "recurring" || reminder.status !== "active") return;
  if (!reminder.recurrenceFrequency) return; // reminderInputSchema requires this for recurring — defensive only

  if (reminder.recurrenceCount) {
    const generatedCount = await prisma.reminderOccurrence.count({
      where: { householdId: reminder.householdId, reminderId: reminder.id },
    });
    if (generatedCount >= reminder.recurrenceCount) return; // cap reached — stop generating, Reminder itself stays active
  }

  const addInterval = ADD_BY_FREQUENCY[reminder.recurrenceFrequency];
  const nextRemindAt = addInterval(terminatedOccurrence.remindAt, reminder.recurrenceInterval ?? 1);

  if (reminder.recurrenceEndDate && nextRemindAt > reminder.recurrenceEndDate) return; // cap reached

  await prisma.reminderOccurrence.create({
    data: { householdId: reminder.householdId, reminderId: reminder.id, remindAt: nextRemindAt, status: "pending" },
  });
}
