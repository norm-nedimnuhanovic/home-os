"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createSubscriptionInputSchema, type CreateSubscriptionFormInput } from "../entities/subscription";

export async function createSubscription(input: CreateSubscriptionFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createSubscriptionInputSchema.parse(input);

  const subscription = await prisma.subscription.create({
    data: {
      householdId: member.householdId,
      name: data.name,
      merchant: data.merchant ?? null,
      categoryId: data.categoryId,
      amount: data.amount,
      variableAmount: data.variableAmount,
      frequency: data.frequency,
      customIntervalDays: data.customIntervalDays ?? null,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      // First due date is the start date itself — the sweep/mark-paid flow
      // advances it from there (entities/subscription.ts's computeNextDueDate).
      nextDueDate: data.startDate,
      alertDaysBefore: data.alertDaysBefore,
      responsibleMemberId: data.responsibleMemberId,
      autoCreateTransaction: data.autoCreateTransaction,
    },
  });

  revalidatePath("/finance/subscriptions");
  return subscription;
}
