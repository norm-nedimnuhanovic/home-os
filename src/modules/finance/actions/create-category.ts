"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createCategoryInputSchema, type CreateCategoryFormInput } from "../entities/category";

// No ownership check — Category is shared household configuration, like
// Tag, not personal data (plan.md §9 Q22: no special stricter permission
// model for Finance; there's no creator field on Category to check anyway).
export async function createCategory(input: CreateCategoryFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createCategoryInputSchema.parse(input);

  const category = await prisma.category.create({
    data: {
      householdId: member.householdId,
      name: data.name,
      type: data.type,
      color: data.color ?? null,
      icon: data.icon ?? null,
    },
  });

  revalidatePath("/finance");
  return category;
}
