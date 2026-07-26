"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createShoppingListItemInputSchema, type CreateShoppingListItemFormInput } from "../entities/shopping-list-item";
import { getShoppingList } from "../queries/get-shopping-list";
import { emitShoppingListItemAdded } from "../events/emitters";

// plan.md §9 Q30: any member with access to the list can add items.
export async function addShoppingListItem(listId: string, input: CreateShoppingListItemFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const list = await getShoppingList(member, listId); // visibility check

  const data = createShoppingListItemInputSchema.parse(input);

  const maxSortOrder = list.items.reduce((max, item) => Math.max(max, item.sortOrder), 0);

  const item = await prisma.shoppingListItem.create({
    data: {
      householdId: member.householdId,
      listId,
      name: data.name,
      quantity: data.quantity ?? null,
      category: data.category ?? null,
      notes: data.notes ?? null,
      addedById: member.id,
      // Appended at the end only — no fine-grained drag-reorder in V1
      // (same scope cut Kanban's own card drag-and-drop already accepted).
      sortOrder: maxSortOrder + 1,
    },
  });

  await emitShoppingListItemAdded(member.householdId, listId, item.id, item.name, member.id);

  revalidatePath(`/life-admin/shopping-lists/${listId}`);
  return item;
}
