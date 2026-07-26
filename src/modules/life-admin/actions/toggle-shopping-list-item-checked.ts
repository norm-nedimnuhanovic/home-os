"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getShoppingList } from "../queries/get-shopping-list";
import { emitShoppingListItemChecked, emitShoppingListItemUnchecked } from "../events/emitters";

// plan.md §9 Q30: any member with access to the list can check items off —
// no view-only tier. Flipping to true stamps checkedBy/checkedAt; flipping
// back clears both (plan.md §3.5's own field description for this entity).
export async function toggleShoppingListItemChecked(listId: string, itemId: string, isChecked: boolean) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getShoppingList(member, listId); // visibility check on the parent list

  const item = await prisma.shoppingListItem.update({
    where: { id: itemId, householdId: member.householdId, listId },
    data: isChecked
      ? { isChecked: true, checkedById: member.id, checkedAt: new Date() }
      : { isChecked: false, checkedById: null, checkedAt: null },
  });

  if (isChecked) {
    await emitShoppingListItemChecked(member.householdId, listId, itemId, member.id);
  } else {
    await emitShoppingListItemUnchecked(member.householdId, listId, itemId, member.id);
  }

  revalidatePath(`/life-admin/shopping-lists/${listId}`);
  return item;
}
