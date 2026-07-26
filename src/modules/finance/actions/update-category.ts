"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createCategoryInputSchema, type CreateCategoryFormInput } from "../entities/category";

export async function updateCategory(categoryId: string, input: CreateCategoryFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createCategoryInputSchema.parse(input);

  const category = await prisma.category.update({
    where: { id: categoryId, householdId: member.householdId },
    data: {
      name: data.name,
      type: data.type,
      color: data.color ?? null,
      icon: data.icon ?? null,
    },
  });

  revalidatePath("/finance");
  return category;
}
