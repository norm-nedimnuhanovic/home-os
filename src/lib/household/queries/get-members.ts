import { prisma } from "@/lib/db";

export async function getMembers(householdId: string) {
  return prisma.member.findMany({
    where: { householdId, status: "active" },
    orderBy: { displayName: "asc" },
  });
}
