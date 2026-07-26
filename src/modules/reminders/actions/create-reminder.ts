"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { reminderInputSchema, type ReminderInputArgs } from "../entities/reminder";
import { emitReminderCreated } from "../events/emitters";
import type { ReminderSourceType } from "@prisma/client";

// Real bug found and fixed (Email & Scheduled Jobs phase): this function
// previously never set the polymorphic-source convenience FKs
// (sourceTaskId/sourceSubscriptionId/sourceRenewalId/sourceDocumentId/
// sourceBudgetId) that prisma/schema.prisma's Task/Subscription/Renewal/
// Document/Budget.reminders relations are actually defined through — every
// Reminder this app ever created only had sourceType/sourceEntityId set,
// so `include: { reminders: {...} }` from the *source* side (e.g.
// getVisibleTasks()'s task.reminders) always came back empty regardless of
// sourceType, even though the generic sourceEntityId-based lookup
// (`where: { sourceType, sourceEntityId }`) always worked fine. Caught via
// an actual browser test: a Task's "remind before due" edit dialog never
// showed the reminder it had genuinely created.
function sourceConvenienceFields(sourceType: ReminderSourceType, sourceEntityId: string | null | undefined) {
  if (!sourceEntityId) return {};
  switch (sourceType) {
    case "task":
      return { sourceTaskId: sourceEntityId };
    case "subscription":
      return { sourceSubscriptionId: sourceEntityId };
    case "renewal":
      return { sourceRenewalId: sourceEntityId };
    case "document":
      return { sourceDocumentId: sourceEntityId };
    case "budget":
      return { sourceBudgetId: sourceEntityId };
    case "manual":
    case "other":
      return {};
  }
}

// The shared platform capability (plan.md §4.5, docs/recipes.md §4.3):
// other modules create Reminders through this rather than building their
// own reminder/scheduling logic. Deliberately does NOT call requireMember()
// — it's called both by create-manual-reminder.ts (already
// auth-checked) and directly by other modules' cron sweep jobs, which have
// no acting member/session at all. Never wire this directly to a
// client-facing form; householdId/createdByMemberId must always come from
// an already-resolved, trusted caller.
export async function createReminder(input: ReminderInputArgs) {
  const data = reminderInputSchema.parse(input);

  const reminder = await prisma.reminder.create({
    data: {
      householdId: data.householdId,
      title: data.title,
      description: data.description ?? null,
      reminderType: data.reminderType,
      targetMemberId: data.targetMemberId,
      createdByMemberId: data.createdByMemberId,
      sourceType: data.sourceType,
      sourceModule: data.sourceModule ?? null,
      sourceEntityId: data.sourceEntityId ?? null,
      ...sourceConvenienceFields(data.sourceType, data.sourceEntityId),
      firstRemindAt: data.firstRemindAt,
      leadTimeValue: data.leadTimeValue ?? null,
      leadTimeUnit: data.leadTimeUnit ?? null,
      recurrenceFrequency: data.recurrenceFrequency ?? null,
      recurrenceInterval: data.recurrenceInterval,
      recurrenceDaysOfWeek: data.recurrenceDaysOfWeek ?? null,
      recurrenceEndDate: data.recurrenceEndDate ?? null,
      recurrenceCount: data.recurrenceCount ?? null,
      emailEnabled: data.emailEnabled,
      // Only one occurrence is ever live per reminder at a time (plan.md
      // §3.3) — the first one is created right away; the next is only ever
      // generated lazily once this one resolves.
      occurrences: {
        create: { householdId: data.householdId, remindAt: data.firstRemindAt },
      },
    },
    include: { occurrences: true },
  });

  await emitReminderCreated(data.householdId, reminder.id, data.createdByMemberId);

  revalidatePath("/reminders");
  return reminder;
}
