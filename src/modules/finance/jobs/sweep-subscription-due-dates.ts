import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { postSubscriptionPayment } from "../actions/post-subscription-payment";
import { emitBillDueSoon } from "../events/emitters";

// plan.md §4.7: "an alert-before-due Reminder is created/updated the same
// way Budget alerts are, and can optionally auto-generate a paid-occurrence
// Transaction (autoCreateTransaction)." Direct barrel import into
// reminders, not an EventSubscription (docs/recipes.md §4.1) — same
// pattern as sweep-budget-thresholds.ts.
//
// Looped per household, never a single cross-household bulk query —
// Subscription is tenant-scoped (src/lib/db/tenant-guard.ts), so a single
// `findMany({ where: { status: "active" } })` with no householdId throws
// `Refusing Subscription.findMany: missing householdId` the instant this
// job actually runs against the real, guarded Prisma client. Confirmed
// empirically; the same bug affected every cron sweep job in the app — see
// ROADMAP.md.
export async function sweepSubscriptionDueDates() {
  const now = new Date();
  const households = await prisma.household.findMany({ where: { status: "active" }, select: { id: true } });

  let checked = 0;
  let alerted = 0;

  for (const { id: householdId } of households) {
    // alertDaysBefore is a per-row value Prisma can't compare against
    // nextDueDate within one where clause, so this filters in memory —
    // household sizes here are small; not worth a raw SQL query for it.
    const active = await prisma.subscription.findMany({ where: { householdId, status: "active" } });
    checked += active.length;
    const dueSoon = active.filter((s) => addDays(now, s.alertDaysBefore) >= s.nextDueDate);
    alerted += dueSoon.length;

    for (const subscription of dueSoon) {
      // Idempotency: don't re-fire for the same due date on every sweep run.
      const alreadyAlerted = await prisma.reminder.findFirst({
        where: {
          householdId,
          sourceType: "subscription",
          sourceEntityId: subscription.id,
          status: { in: ["active", "paused"] },
          createdAt: { gte: subscription.lastPaidDate ?? subscription.startDate },
        },
      });
      if (!alreadyAlerted) {
        await createReminder({
          householdId,
          title: `${subscription.name} is due soon`,
          targetMemberId: subscription.responsibleMemberId,
          createdByMemberId: subscription.responsibleMemberId, // system-triggered
          sourceType: "subscription",
          sourceModule: "finance",
          sourceEntityId: subscription.id,
          reminderType: "one_off",
          firstRemindAt: addDays(subscription.nextDueDate, -subscription.alertDaysBefore),
        });

        await emitBillDueSoon(householdId, subscription.id, subscription.nextDueDate);
      }

      if (subscription.autoCreateTransaction && subscription.nextDueDate <= now) {
        await postSubscriptionPayment(subscription, subscription.responsibleMemberId);
      }
    }
  }

  return { checked, alerted };
}
