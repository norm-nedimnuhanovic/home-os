"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";

export async function archiveCategory(categoryId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // Hidden from new-entry pickers, still valid on historical records
  // (plan.md §3.4) — never a hard delete.
  const category = await prisma.category.update({
    where: { id: categoryId, householdId: member.householdId },
    data: { archived: true },
  });

  revalidatePath("/finance");
  return category;
}
