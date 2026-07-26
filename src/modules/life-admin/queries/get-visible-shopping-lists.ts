import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import { SHOPPING_LIST_VISIBILITY_SCOPE } from "../entities/shopping-list";

export async function getVisibleShoppingLists(actingMember: ActingMember, filters: { archived?: boolean } = {}) {
  return prisma.shoppingList.findMany({
    where: {
      AND: [
        await visibilityWhere(actingMember, SHOPPING_LIST_VISIBILITY_SCOPE),
        { isArchived: filters.archived ?? false },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}
