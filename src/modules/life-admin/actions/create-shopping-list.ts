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

export async function createShoppingList(input: CreateShoppingListFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createShoppingListInputSchema.parse(input);

  const list = await prisma.shoppingList.create({
    data: {
      householdId: member.householdId,
      name: data.name,
      type: data.type,
      description: data.description ?? null,
      visibility: data.visibility,
      createdById: member.id,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: SHOPPING_LIST_VISIBILITY_SCOPE.moduleKey,
      objectType: SHOPPING_LIST_VISIBILITY_SCOPE.objectType,
      objectId: list.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  revalidatePath("/life-admin"); // the hub page renders the list-of-lists — "/life-admin/shopping-lists" has no page.tsx of its own
  return list;
}
