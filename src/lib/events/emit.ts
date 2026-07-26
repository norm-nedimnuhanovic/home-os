import { prisma } from "@/lib/db";
import { dispatchToSubscribers } from "./dispatch";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

// Every module's Server Action that reaches a notable moment calls this one
// shared function — never writes to EventOccurrence directly, and never
// invokes a subscriber's handler itself (docs/module-architecture.md §4.1).
//
// Runs synchronously, inline with the action — there is no message queue in
// V1. Call it LAST, after the primary write succeeds: if the action's own
// transaction rolls back after this call, the EventOccurrence row (and
// anything it triggered) is NOT rolled back with it.
export async function emitEvent(
  householdId: string,
  eventTypeKey: string, // e.g. "task.completed" — always <module_key>.<event_name>
  payload: Record<string, unknown>,
  triggeredByMemberId: string | null, // null for a system/time-based trigger, e.g. a cron sweep
) {
  const eventType = await prisma.moduleEventType.findUniqueOrThrow({ where: { key: eventTypeKey } });

  // Cast needed because the tenant-guard extension's `$allOperations` wrapper
  // (src/lib/db/tenant-guard.ts) doesn't preserve the conditional
  // include-based return type through TypeScript — the `include` below is
  // still respected at runtime.
  const occurrence = (await prisma.eventOccurrence.create({
    data: {
      householdId,
      eventTypeId: eventType.id,
      emittedByModuleId: eventType.owningModuleId,
      occurredAt: new Date(),
      triggeredByMemberId,
      payloadSnapshot: payload,
      subscriptionsNotified: 0, // updated in place once dispatch finishes
    },
    include: { eventType: true },
  })) as EventOccurrence & { eventType: ModuleEventType };

  await dispatchToSubscribers(occurrence);
  return occurrence;
}
