import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";
import { SHOPPING_LIST_VISIBILITY_SCOPE } from "../entities/shopping-list";

// ShoppingListItem carries no visibility column of its own (entities/
// shopping-list-item.ts) — it's only ever reached through its parent list,
// scoped here. Never query prisma.shoppingListItem directly from anywhere
// outside this module.
export async function getShoppingList(actingMember: ActingMember, listId: string) {
  const list = await prisma.shoppingList.findFirst({
    where: {
      AND: [{ id: listId }, await visibilityWhere(actingMember, SHOPPING_LIST_VISIBILITY_SCOPE)],
    },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { addedBy: { select: { displayName: true } }, checkedBy: { select: { displayName: true } } },
      },
    },
  });
  if (!list) throw new NotFoundError("Shopping list not found.");
  return list;
}
