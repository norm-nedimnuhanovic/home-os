"use server";

import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function markAllNotificationsRead() {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  return prisma.notification.updateMany({
    where: { householdId: member.householdId, memberId: member.id, readAt: null },
    data: { readAt: new Date() },
  });
}
