"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";

export async function cancelSubscription(subscriptionId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const subscription = await prisma.subscription.update({
    where: { id: subscriptionId, householdId: member.householdId },
    data: { status: "cancelled" },
  });

  revalidatePath("/finance/subscriptions");
  return subscription;
}
