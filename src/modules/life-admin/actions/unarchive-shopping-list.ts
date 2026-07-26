"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getShoppingList } from "../queries/get-shopping-list";

export async function unarchiveShoppingList(listId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getShoppingList(member, listId);

  const list = await prisma.shoppingList.update({
    where: { id: listId, householdId: member.householdId },
    data: { isArchived: false },
  });

  revalidatePath("/life-admin"); // the hub page renders the list-of-lists
  return list;
}
