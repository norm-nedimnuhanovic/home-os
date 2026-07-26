import "server-only";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import type { LeadTimeUnit, Task } from "@prisma/client";

// Cancels this task's existing "remind before due date" Reminder directly
// via Prisma rather than the user-facing cancelReminder() action — same
// reasoning as life-admin's cancelRenewalReminders(): a system-level "this
// no longer applies," fully householdId+sourceEntityId scoped, not a
// per-member cancellation gated on who happens to be acting.
export async function cancelTaskDueReminder(task: Pick<Task, "id" | "householdId">) {
  const existingReminders = await prisma.reminder.findMany({
    where: {
      householdId: task.householdId,
      sourceType: "task",
      sourceEntityId: task.id,
      status: { in: ["active", "paused"] },
    },
    select: { id: true },
  });
  if (existingReminders.length === 0) return;

  const reminderIds = existingReminders.map((r) => r.id);
  await prisma.reminder.updateMany({
    where: { householdId: task.householdId, id: { in: reminderIds } },
    data: { status: "cancelled" },
  });
  await prisma.reminderOccurrence.updateMany({
    where: {
      householdId: task.householdId,
      reminderId: { in: reminderIds },
      status: { in: ["pending", "notified", "snoozed"] },
    },
    data: { status: "dismissed" },
  });
}

// Opt-in "remind me before due date" (task.due_soon, docs/email.md §2.2) —
// cancels any existing reminder for this task, then creates a fresh one if
// still wanted. Called from create-task.ts/update-task.ts whenever
// dueDate/remindBeforeDue/lead-time might have changed; same cancel-and-
// recreate shape as life-admin's regenerateRenewalReminders(), to avoid
// duplicate emails the same way changing a Renewal's dates does.
export async function regenerateTaskDueReminder(
  task: Pick<Task, "id" | "householdId" | "title" | "dueDate" | "assigneeId" | "createdById">,
  remindBeforeDue: boolean,
  leadTimeValue: number,
  leadTimeUnit: LeadTimeUnit,
  actingMemberId: string,
) {
  await cancelTaskDueReminder(task);

  if (!remindBeforeDue || !task.dueDate) return;

  await createReminder({
    householdId: task.householdId,
    title: `${task.title} is due soon`,
    // Falls back to the acting member when the task has no assignee yet —
    // a reminder needs a real targetMemberId (Reminder.targetMemberId is
    // required), and reminding whoever opted this on is more useful than
    // silently not creating one.
    targetMemberId: task.assigneeId ?? task.createdById,
    createdByMemberId: actingMemberId,
    sourceType: "task",
    sourceModule: "tasks",
    sourceEntityId: task.id,
    reminderType: "one_off",
    firstRemindAt: subtractLeadTime(task.dueDate, leadTimeValue, leadTimeUnit),
    leadTimeValue,
    leadTimeUnit,
  });
}

function subtractLeadTime(date: Date, value: number, unit: LeadTimeUnit): Date {
  const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 }[unit];
  return new Date(date.getTime() - value * ms);
}
