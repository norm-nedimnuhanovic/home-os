import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getSubscription(householdId: string, subscriptionId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, householdId }, // both, always — not just id
  });
  if (!subscription) throw new NotFoundError("Subscription not found.");
  return subscription;
}
