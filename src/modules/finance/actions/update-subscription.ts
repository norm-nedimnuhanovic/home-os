"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createSubscriptionInputSchema, type CreateSubscriptionFormInput } from "../entities/subscription";

export async function updateSubscription(subscriptionId: string, input: CreateSubscriptionFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createSubscriptionInputSchema.parse(input);

  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId, householdId: member.householdId },
    data: {
      name: data.name,
      merchant: data.merchant ?? null,
      categoryId: data.categoryId,
      amount: data.amount,
      variableAmount: data.variableAmount,
      frequency: data.frequency,
      customIntervalDays: data.customIntervalDays ?? null,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      alertDaysBefore: data.alertDaysBefore,
      responsibleMemberId: data.responsibleMemberId,
      autoCreateTransaction: data.autoCreateTransaction,
    },
  });

  revalidatePath("/finance/subscriptions");
  return subscription;
}
