import { prisma } from "@/lib/db";
import { STARTER_CATEGORIES } from "../entities/category";

// Matches seedModuleGrantsForHousehold()'s own derivation (src/lib/access/
// module-grants.ts) — the tenant-guard extension changes the client's type,
// so this can't just be PrismaClient | Prisma.TransactionClient.
type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Called once, inside the same transaction that creates the Household
// (plan.md §3.4: "isSystemDefault... platform-seeded starter categories at
// household creation" — still editable/archivable afterward, never
// re-seeded). Mirrors seedModuleGrantsForHousehold()'s shape.
export async function seedStarterCategories(db: Db, householdId: string) {
  await db.category.createMany({
    data: STARTER_CATEGORIES.map((category, index) => ({
      householdId,
      name: category.name,
      type: category.type,
      isSystemDefault: true,
      sortOrder: index,
    })),
  });
}
