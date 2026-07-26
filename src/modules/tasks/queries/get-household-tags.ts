import { prisma } from "@/lib/db";

export async function getHouseholdTags(householdId: string) {
  return prisma.tag.findMany({ where: { householdId }, orderBy: { name: "asc" } });
}
