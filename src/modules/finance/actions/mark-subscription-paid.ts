"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { getSubscription } from "../queries/get-subscription";
import { postSubscriptionPayment } from "./post-subscription-payment";

// The manual logging path (plan.md §4.7) — the alternative to
// autoCreateTransaction. Posts the paid-occurrence Transaction and advances
// nextDueDate/lastPaidDate the same way the sweep job does for
// autoCreateTransaction subscriptions.
export async function markSubscriptionPaid(subscriptionId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const subscription = await getSubscription(member.householdId, subscriptionId);
  const result = await postSubscriptionPayment(subscription, member.id);

  revalidatePath("/finance/subscriptions");
  revalidatePath("/finance");
  return result;
}
