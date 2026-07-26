"use server";

import { prisma } from "@/lib/db";
import { computeNextDueDate } from "../entities/subscription";
import type { Subscription } from "@prisma/client";

// The internal capability both the user-facing markSubscriptionPaid() and
// the (session-less) sweep-subscription-due-dates job call — deliberately
// does NOT call requireMember(), matching the createReminder()/
// createManualReminder() split in the reminders module for the exact same
// reason: a cron sweep has no acting member at all.
export async function postSubscriptionPayment(subscription: Subscription, paidById: string) {
  const [transaction, updated] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        householdId: subscription.householdId,
        type: "expense",
        amount: subscription.amount,
        categoryId: subscription.categoryId,
        title: subscription.name,
        date: subscription.nextDueDate,
        paidById,
        source: "subscription",
        subscriptionId: subscription.id,
      },
    }),
    prisma.subscription.update({
      where: { id: subscription.id, householdId: subscription.householdId },
      data: {
        lastPaidDate: subscription.nextDueDate,
        nextDueDate: computeNextDueDate(
          subscription.nextDueDate,
          subscription.frequency,
          subscription.customIntervalDays,
        ),
      },
    }),
  ]);

  return { transaction, subscription: updated };
}
