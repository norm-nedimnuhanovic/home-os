import { prisma } from "@/lib/db";
import { eventHandlers } from "./handlers";
import { fanOutNotificationsForOccurrence } from "@/lib/notifications/dispatch";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

const MAX_CONSECUTIVE_FAILURES = 5; // fixed platform-wide constant, not per-subscription configurable in V1

export async function dispatchToSubscribers(
  occurrence: EventOccurrence & { eventType: ModuleEventType },
) {
  // Baseline platform behavior — every occurrence gets the Notification/email
  // fan-out for its categoryKey for free, gated only by NotificationPreference
  // (docs/email.md). This is NOT an EventSubscription and no module opts
  // into it by registering one (docs/seeding.md §5.4's framing).
  await fanOutNotificationsForOccurrence(occurrence);

  const subscriptions = await prisma.eventSubscription.findMany({
    where: { eventTypeId: occurrence.eventTypeId, active: true },
    include: { subscriberModule: true },
  });

  let notified = 0;

  for (const sub of subscriptions) {
    const handler = eventHandlers[`${sub.subscriberModule.key}:${occurrence.eventType.key}`];
    if (!handler) continue; // registered in the DB but no compiled handler wired — no-op, never throws

    try {
      await handler(occurrence.payloadSnapshot, occurrence.householdId);
      notified += 1;
      await prisma.eventSubscription.update({
        where: { id: sub.id },
        data: { consecutiveFailureCount: 0, lastTriggeredAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[events] ${sub.subscriberModule.key} failed reacting to ${occurrence.eventType.key}: ${message}`,
      );

      if (sub.onFailure === "ignore") continue; // no count increment, no active flip, no persisted error

      const consecutiveFailureCount = sub.consecutiveFailureCount + 1;
      const shouldDisable =
        sub.onFailure === "disable_after_n_failures" &&
        consecutiveFailureCount >= MAX_CONSECUTIVE_FAILURES;

      await prisma.eventSubscription.update({
        where: { id: sub.id },
        data: {
          consecutiveFailureCount,
          lastError: message,
          active: shouldDisable ? false : sub.active,
        },
      });
    }
    // One subscriber's failure never blocks another subscriber's turn, and
    // never rethrows into the emitting Server Action — the action that
    // completed a task must succeed regardless of Kanban's reaction to it.
  }

  await prisma.eventOccurrence.update({
    where: { id: occurrence.id, householdId: occurrence.householdId }, // both, always — never id alone
    data: { subscriptionsNotified: notified },
  });
}
