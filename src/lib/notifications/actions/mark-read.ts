"use server";

import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function markNotificationRead(notificationId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // householdId AND memberId, both — never id alone (CLAUDE.md rule 1), and
  // memberId scopes to "mine" specifically, since a Notification's
  // recipient is the only person allowed to dismiss it.
  return prisma.notification.updateMany({
    where: { id: notificationId, householdId: member.householdId, memberId: member.id },
    data: { readAt: new Date() },
  });
}
