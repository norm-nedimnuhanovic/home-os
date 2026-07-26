import type { ReminderSourceType } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Resolves which NotificationPreference.categoryKey gates a firing
 * ReminderOccurrence's email/digest delivery. Not a flat "reminder.due" for
 * every source type — see docs/email.md §2.2.
 */
export function resolveReminderCategoryKey(sourceType: ReminderSourceType): string {
  switch (sourceType) {
    case "subscription":
      return "bill.due_soon";
    case "budget":
      return "budget.threshold_exceeded";
    case "renewal":
      return "renewal.expiring_soon";
    case "task":
      return "task.due_soon";
    case "manual":
    case "document":
    case "other":
    default:
      return "reminder.due";
  }
}

/**
 * Missing row means "on," never "off" — matching every field's stated
 * default (docs/email.md §3.2).
 */
export async function getEffectivePreference(householdId: string, memberId: string, categoryKey: string) {
  const pref = await prisma.notificationPreference.findUnique({
    // householdId is redundant with memberId (a Member belongs to exactly
    // one household) but required explicitly — every scoped query filters
    // on it, never on id/memberId alone (CLAUDE.md rule 1).
    where: { memberId_categoryKey: { memberId, categoryKey }, householdId },
  });
  return {
    emailEnabled: pref?.emailEnabled ?? true,
    inAppEnabled: pref?.inAppEnabled ?? true,
    digestEnabled: pref?.digestEnabled ?? true,
  };
}
