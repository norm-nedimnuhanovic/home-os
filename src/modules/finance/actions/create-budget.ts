"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createBudgetInputSchema, type CreateBudgetFormInput } from "../entities/budget";

// No ownership check — Budget is shared household configuration (plan.md
// §9 Q22), and there's no creator field on the model to check anyway.
export async function createBudget(input: CreateBudgetFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createBudgetInputSchema.parse(input);

  const budget = await prisma.budget.create({
    data: {
      householdId: member.householdId,
      categoryId: data.categoryId,
      memberId: data.memberId ?? null,
      period: data.period,
      amount: data.amount,
      effectiveFrom: data.effectiveFrom,
      endDate: data.endDate ?? null,
      alertThresholdPercent: data.alertThresholdPercent,
      alertOnExceeded: data.alertOnExceeded,
    },
  });

  revalidatePath("/finance/budgets");
  return budget;
}
