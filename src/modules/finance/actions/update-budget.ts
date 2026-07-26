"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createBudgetInputSchema, type CreateBudgetFormInput } from "../entities/budget";

export async function updateBudget(budgetId: string, input: CreateBudgetFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createBudgetInputSchema.parse(input);

  // Setting endDate to a past/today date is how a budget is "ended" in V1
  // — there's no separate delete action (plan.md's endDate: null = ongoing).
  const budget = await prisma.budget.update({
    where: { id: budgetId, householdId: member.householdId },
    data: {
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
