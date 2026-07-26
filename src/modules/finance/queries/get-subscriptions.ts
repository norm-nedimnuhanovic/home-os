import { prisma } from "@/lib/db";
import type { SubscriptionStatus } from "@prisma/client";

// Subscription has no visibility column — household-wide (docs/access-
// control.md §5.1's list excludes it).
export async function getSubscriptions(householdId: string, filters: { status?: SubscriptionStatus } = {}) {
  return prisma.subscription.findMany({
    where: { householdId, ...(filters.status ? { status: filters.status } : {}) },
    orderBy: { nextDueDate: "asc" },
    include: {
      category: true,
      responsibleMember: { select: { displayName: true } },
      // Same reverse-of-Notes'-"Linked to" pattern as Task/Event — the
      // polymorphic-target convenience relation already exists on NoteLink.
      noteLinks: { include: { note: { select: { id: true, title: true } } } },
    },
  });
}
