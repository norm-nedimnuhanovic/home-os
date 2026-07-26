import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";

export async function getInbox(actingMember: Pick<ActingMember, "id" | "householdId">) {
  return prisma.notification.findMany({
    where: { householdId: actingMember.householdId, memberId: actingMember.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
