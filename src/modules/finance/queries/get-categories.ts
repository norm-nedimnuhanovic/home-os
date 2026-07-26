import { prisma } from "@/lib/db";

// Category has no visibility column — it's household-wide, shared
// vocabulary (docs/access-control.md §5.1's list excludes it).
export async function getCategories(householdId: string, filters: { archived?: boolean } = {}) {
  return prisma.category.findMany({
    where: { householdId, archived: filters.archived ?? false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
