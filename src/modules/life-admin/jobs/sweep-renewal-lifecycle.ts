import { prisma } from "@/lib/db";
import { getRenewalLifecycleStatus } from "../entities/renewal";
import { emitRenewalExpiringSoon, emitRenewalExpired } from "../events/emitters";

// Backs /api/cron/renewals-sweep, daily at 06:00 (docs/email.md §9.4).
//
// Audit-trail/automation-hook events only — the member-facing alert already
// happened via the Reminder regenerateRenewalReminders() created eagerly at
// Renewal creation/update time (delivered by reminders' own sweep, see
// sweep-due-occurrences.ts). This job never writes Renewal.status itself —
// active/expiring_soon/expired stay a derived, read-time-only value
// (entities/renewal.ts's getRenewalLifecycleStatus()).
//
// Looped per household, never a single cross-household bulk query — Renewal
// is tenant-scoped (src/lib/db/tenant-guard.ts), so a single
// `findMany({ where: { status: "active" } })` with no householdId throws
// `Refusing Renewal.findMany: missing householdId` the instant this job
// actually runs against the real, guarded Prisma client. Confirmed
// empirically; the same bug affected every cron sweep job in the app — see
// ROADMAP.md.
export async function sweepRenewalLifecycle(now = new Date()) {
  const households = await prisma.household.findMany({ where: { status: "active" }, select: { id: true } });

  let checked = 0;
  let expiringSoonAlerted = 0;
  let expiredAlerted = 0;

  for (const { id: householdId } of households) {
    const candidates = await prisma.renewal.findMany({ where: { householdId, status: "active" } });
    checked += candidates.length;

    for (const renewal of candidates) {
      const lifecycleStatus = getRenewalLifecycleStatus(renewal, now);
      if (lifecycleStatus === "active") continue;

      const sinceCycleStart = renewal.lastRenewedAt ?? renewal.createdAt;
      const eventTypeKey = lifecycleStatus === "expired" ? "renewal.expired" : "renewal.expiring_soon";

      // Idempotency: only ever emit once per lifecycle window per renewal.
      // This is a read-only existence check, not an atomic claim (docs/email.md
      // §9.7) — unlike reminders-sweep, emitting this event has no email/
      // Reminder side effect of its own (that already happened at creation
      // time), so a duplicate audit-log row from a rare overlapping invocation
      // is a harmless cosmetic issue, not a duplicate-email bug.
      const alreadyEmitted = await prisma.eventOccurrence.findFirst({
        where: {
          householdId,
          eventType: { key: eventTypeKey },
          occurredAt: { gte: sinceCycleStart },
          payloadSnapshot: { path: ["renewalId"], equals: renewal.id },
        },
      });
      if (alreadyEmitted) continue;

      if (lifecycleStatus === "expired") {
        await emitRenewalExpired(householdId, renewal.id);
        expiredAlerted++;
      } else {
        await emitRenewalExpiringSoon(householdId, renewal.id, renewal.expiryDate);
        expiringSoonAlerted++;
      }
    }
  }

  return { checked, expiringSoonAlerted, expiredAlerted };
}
