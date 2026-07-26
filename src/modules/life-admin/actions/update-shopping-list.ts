"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import {
  createShoppingListInputSchema,
  type CreateShoppingListFormInput,
  SHOPPING_LIST_VISIBILITY_SCOPE,
} from "../entities/shopping-list";
import { getShoppingList } from "../queries/get-shopping-list";

// plan.md §9 Q30 names ShoppingList explicitly: anyone with access can edit
// it, same as Contact — being able to load it via getShoppingList()
// (visibility-checked) IS the authorization check.
export async function updateShoppingList(listId: string, input: CreateShoppingListFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getShoppingList(member, listId);

  const data = createShoppingListInputSchema.parse(input);

  const list = await prisma.shoppingList.update({
    where: { id: listId, householdId: member.householdId },
    data: {
      name: data.name,
      type: data.type,
      description: data.description ?? null,
      visibility: data.visibility,
    },
  });

  await syncObjectShares({
    householdId: member.householdId,
    moduleKey: SHOPPING_LIST_VISIBILITY_SCOPE.moduleKey,
    objectType: SHOPPING_LIST_VISIBILITY_SCOPE.objectType,
    objectId: list.id,
    sharedByMemberId: member.id,
    sharedWithMemberIds: data.visibility === "specific_members" ? data.sharedWithMemberIds ?? [] : [],
  });

  revalidatePath("/life-admin"); // the hub page renders the list-of-lists
  revalidatePath(`/life-admin/shopping-lists/${listId}`);
  return list;
}
