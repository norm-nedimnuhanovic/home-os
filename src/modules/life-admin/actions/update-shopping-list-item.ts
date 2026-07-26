"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { updateShoppingListItemInputSchema, type UpdateShoppingListItemFormInput } from "../entities/shopping-list-item";
import { getShoppingList } from "../queries/get-shopping-list";

export async function updateShoppingListItem(listId: string, itemId: string, input: UpdateShoppingListItemFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getShoppingList(member, listId);

  const data = updateShoppingListItemInputSchema.parse(input);

  const item = await prisma.shoppingListItem.update({
    where: { id: itemId, householdId: member.householdId, listId },
    data: {
      name: data.name,
      quantity: data.quantity ?? null,
      category: data.category ?? null,
      notes: data.notes ?? null,
    },
  });

  revalidatePath(`/life-admin/shopping-lists/${listId}`);
  return item;
}
