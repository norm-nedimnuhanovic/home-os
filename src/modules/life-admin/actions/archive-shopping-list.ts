"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getShoppingList } from "../queries/get-shopping-list";

export async function archiveShoppingList(listId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getShoppingList(member, listId); // visibility check — Q30 reasoning as updateShoppingList

  const list = await prisma.shoppingList.update({
    where: { id: listId, householdId: member.householdId },
    data: { isArchived: true },
  });

  revalidatePath("/life-admin"); // the hub page renders the list-of-lists
  return list;
}
