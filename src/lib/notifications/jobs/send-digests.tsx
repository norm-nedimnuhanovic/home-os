import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/resend-client";
import { DigestEmail, digestSubject } from "@/lib/email/templates/digest";
import { nextDigestRunAt } from "@/lib/dates";
import { resolveReminderCategoryKey } from "@/lib/notifications/entities/notification-preference";

// Backs /api/cron/digests-send, hourly (docs/email.md §8, §9.5).
//
// Looped per household, never a single cross-household bulk query —
// DigestSubscription is tenant-scoped (src/lib/db/tenant-guard.ts), so a
// single `findMany({ where: { frequency: {...}, nextRunAt: {...} } })` with
// no householdId throws `Refusing DigestSubscription.findMany: missing
// householdId` the instant this job actually runs against the real,
// guarded Prisma client. Confirmed empirically; the same bug affected
// every cron sweep job in the app — see ROADMAP.md.
export async function sendDueDigests(now = new Date()) {
  const households = await prisma.household.findMany({ where: { status: "active" }, select: { id: true } });

  let checked = 0;
  let sent = 0;

  for (const { id: householdId } of households) {
    const due = await prisma.digestSubscription.findMany({
      where: { householdId, frequency: { not: "off" }, nextRunAt: { lte: now } },
      include: { member: { include: { household: true } } },
    });
    checked += due.length;

    for (const sub of due) {
      // Claim by advancing nextRunAt atomically before any side effect
      // (docs/email.md §9.7) — guarded by the exact nextRunAt just read, so
      // a second overlapping invocation sees claimed.count === 0 and skips
      // it. Failure mode if the process dies right after this: one skipped
      // digest, never a duplicate send.
      const advancedNextRunAt = nextDigestRunAt(sub, sub.member.household.timezone, now);
      const claimed = await prisma.digestSubscription.updateMany({
        where: { id: sub.id, householdId, nextRunAt: sub.nextRunAt },
        data: { nextRunAt: advancedNextRunAt, lastSentAt: now },
      });
      if (claimed.count === 0) continue;

      // Missing NotificationPreference row means digestEnabled defaults to
      // "on" — same rule as getEffectivePreference() (docs/email.md §3.2).
      const preferences = await prisma.notificationPreference.findMany({
        where: { householdId, memberId: sub.memberId },
      });
      const preferenceByCategoryKey = new Map(preferences.map((pref) => [pref.categoryKey, pref]));
      const isDigestEnabled = (categoryKey: string) => preferenceByCategoryKey.get(categoryKey)?.digestEnabled ?? true;

      const [allUnread, allActive] = await Promise.all([
        prisma.notification.findMany({
          where: { householdId, memberId: sub.memberId, readAt: null },
        }),
        prisma.reminderOccurrence.findMany({
          where: {
            householdId,
            status: { in: ["pending", "notified"] },
            reminder: { targetMemberId: sub.memberId },
          },
          include: { reminder: true },
        }),
      ]);

      const notifications = allUnread.filter((notification) => isDigestEnabled(notification.categoryKey));
      const occurrences = allActive.filter((occurrence) =>
        isDigestEnabled(resolveReminderCategoryKey(occurrence.reminder.sourceType)),
      );

      if (notifications.length === 0 && occurrences.length === 0) continue; // nextRunAt already advanced above

      // Best-effort — one member's failed send (a Resend outage, a bad
      // address) must never stop the rest of this run's digests from going
      // out; nextRunAt is already advanced above either way, so a failure
      // here is a skipped digest for this period, never a retry loop.
      try {
        await sendTransactionalEmail({
          to: sub.member.email,
          subject: digestSubject(sub.frequency === "daily" ? "daily" : "weekly"),
          react: <DigestEmail notifications={notifications} occurrences={occurrences} />,
        });
        sent++;
      } catch (error) {
        console.error(`Failed to send digest to member ${sub.memberId}:`, error);
      }
    }
  }

  return { checked, sent };
}
