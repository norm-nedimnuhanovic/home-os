import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";

// Reminder has no visibility/ObjectShare column (docs/access-control.md
// §5.1) — its own scope is simpler and stricter: "manage own data +
// assigned items" (CLAUDE.md), i.e. reminders this member created OR is
// the target of, never a household-wide read.
export async function getVisibleReminders(actingMember: Pick<ActingMember, "id" | "householdId">) {
  return prisma.reminder.findMany({
    where: {
      householdId: actingMember.householdId,
      OR: [{ createdByMemberId: actingMember.id }, { targetMemberId: actingMember.id }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      targetMember: { select: { displayName: true } },
      occurrences: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}
