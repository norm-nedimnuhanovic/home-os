"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getShoppingList } from "../queries/get-shopping-list";

// Hard delete, no confirmation dialog — a trivial line item, re-adding is
// one keystroke (docs/tables.md §3.1's explicit tier-3 exception; the
// stakes don't justify the friction). Anyone with list access can remove
// any item, same Q30 reasoning as checking one off.
export async function removeShoppingListItem(listId: string, itemId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getShoppingList(member, listId);

  await prisma.shoppingListItem.delete({ where: { id: itemId, householdId: member.householdId, listId } });

  revalidatePath(`/life-admin/shopping-lists/${listId}`);
}
