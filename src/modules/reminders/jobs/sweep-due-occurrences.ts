import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { sendCategoryEmail } from "@/lib/email/send-category-email";
import { getEffectivePreference, resolveReminderCategoryKey } from "@/lib/notifications/entities/notification-preference";
import { generateNextOccurrenceIfDue } from "../actions/generate-next-occurrence";
import type { Reminder, ReminderOccurrence } from "@prisma/client";

const MISSED_GRACE_HOURS = 24; // plan.md §9 Q14

// Backs /api/cron/reminders-sweep, every 15 minutes (docs/email.md §9.1).
//
// Looped per household, never a single cross-household bulk query — a real,
// confirmed bug found while adding recurring-reminder regeneration to this
// file: ReminderOccurrence is tenant-scoped (src/lib/db/tenant-guard.ts), so
// the original single `updateMany({ where: { status: "pending", ... } })`
// with no householdId threw `Refusing ReminderOccurrence.updateMany:
// missing householdId` the instant this job actually ran against the real,
// guarded Prisma client — confirmed empirically, never caught by unit tests
// because every one of them mocks `@/lib/db` entirely. The same bug (and
// fix) applies to every other cron sweep job — see ROADMAP.md.
export async function sweepDueOccurrences(now = new Date()) {
  const households = await prisma.household.findMany({ where: { status: "active" }, select: { id: true } });

  let totalFired = 0;
  let totalMissed = 0;

  for (const { id: householdId } of households) {
    // 1. Fire everything due: pending -> notified, atomically claimed so two
    // overlapping cron invocations can't both "fire" the same occurrence
    // (docs/email.md §9.7 — never findMany-then-loop-mutate for the claim
    // itself).
    const claimed = await prisma.reminderOccurrence.updateMany({
      where: { householdId, status: "pending", remindAt: { lte: now } },
      data: { status: "notified", notifiedAt: now },
    });
    totalFired += claimed.count;

    if (claimed.count > 0) {
      const justFired = await prisma.reminderOccurrence.findMany({
        where: { householdId, status: "notified", notifiedAt: now },
        include: { reminder: true },
      });

      for (const occurrence of justFired) {
        await emitEvent(
          householdId,
          "reminder.due",
          { reminderId: occurrence.reminderId, occurrenceId: occurrence.id, remindAt: occurrence.remindAt },
          null, // system-triggered — plan.md §3.6: null for time-based triggers
        );
        await deliverFiredOccurrence(occurrence.reminder, occurrence);
      }
    }

    // 2. Grace-window sweep: notified -> missed after 24h unacknowledged.
    // Candidate ids fetched first, then claimed by id + a status recheck —
    // `notifiedAt` never changes once set, so (unlike the fire-claim above)
    // it can't double as a "just transitioned" marker; re-querying by
    // `status: "missed"` alone would re-match every already-missed
    // occurrence from every prior sweep run forever, generating duplicate
    // next-occurrences on every single invocation.
    const missedCandidates = await prisma.reminderOccurrence.findMany({
      where: { householdId, status: "notified", notifiedAt: { lte: subtractHours(now, MISSED_GRACE_HOURS) } },
      select: { id: true },
    });

    if (missedCandidates.length > 0) {
      const missedIds = missedCandidates.map((occurrence) => occurrence.id);
      const missedClaim = await prisma.reminderOccurrence.updateMany({
        where: { householdId, id: { in: missedIds }, status: "notified" },
        data: { status: "missed" },
      });
      totalMissed += missedClaim.count;

      if (missedClaim.count > 0) {
        const justMissed = await prisma.reminderOccurrence.findMany({
          where: { householdId, id: { in: missedIds }, status: "missed" },
          include: { reminder: true },
        });
        for (const occurrence of justMissed) {
          // missed is a terminal state — a recurring reminder's next
          // occurrence is generated lazily right here (plan.md §3.3/§4.5).
          await generateNextOccurrenceIfDue(occurrence.reminder, occurrence);
        }
      }
    }
  }

  return { fired: totalFired, missed: totalMissed };
}

function subtractHours(date: Date, hours: number) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

// docs/email.md §6.2: Reminder-backed categories skip the Notification row
// entirely (ReminderOccurrence itself is the in-app surface, never gated)
// but never skip the email check.
async function deliverFiredOccurrence(reminder: Reminder, occurrence: ReminderOccurrence) {
  const categoryKey = resolveReminderCategoryKey(reminder.sourceType);
  const preference = await getEffectivePreference(reminder.householdId, reminder.targetMemberId, categoryKey);

  // plan.md §4.5: BOTH gates must be on — the reminder's own per-row
  // override AND the member's category preference.
  if (reminder.emailEnabled && preference.emailEnabled) {
    // Best-effort — one occurrence's failed send (a Resend outage, a
    // malformed template) must never stop sweepDueOccurrences() from
    // delivering the rest of this batch's occurrences (docs/email.md §9.7's
    // resilience principle applied to the delivery side, not just claiming).
    try {
      await sendCategoryEmail({ reminder, occurrence }, reminder.targetMemberId, categoryKey);
    } catch (error) {
      console.error(`Failed to send reminder email for occurrence ${occurrence.id}:`, error);
    }
  }
}
