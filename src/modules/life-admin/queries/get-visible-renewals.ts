import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import { RENEWAL_VISIBILITY_SCOPE, EXPIRED_GRACE_PERIOD_DAYS } from "../entities/renewal";
import type { RenewalType } from "@prisma/client";

// plan.md §9 Q28: a Renewal that's been expired for more than the grace
// period auto-archives — implemented as a query-level filter, not a stored
// flag or cron job (docs/orm-conventions.md's derive-don't-store
// principle), same as this entity's active/expiring_soon/expired status
// itself (entities/renewal.ts's getRenewalLifecycleStatus()). "renewed"/
// "cancelled" renewals are never subject to this filter — they're already
// terminal, not silently hidden for being old.
export async function getVisibleRenewals(
  actingMember: ActingMember,
  filters: { type?: RenewalType; includeArchived?: boolean } = {},
) {
  const graceCutoff = new Date();
  graceCutoff.setDate(graceCutoff.getDate() - EXPIRED_GRACE_PERIOD_DAYS);

  return prisma.renewal.findMany({
    where: {
      AND: [
        await visibilityWhere(actingMember, RENEWAL_VISIBILITY_SCOPE),
        filters.type ? { type: filters.type } : {},
        filters.includeArchived
          ? {}
          : { OR: [{ status: { in: ["renewed", "cancelled"] } }, { expiryDate: { gte: graceCutoff } }] },
      ],
    },
    include: { responsibleMember: { select: { displayName: true } }, providerContact: { select: { name: true } } },
    orderBy: { expiryDate: "asc" },
  });
}
