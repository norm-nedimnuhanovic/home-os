import { emitEvent } from "@/lib/events/emit";

export async function emitEventCreated(householdId: string, eventId: string, byMemberId: string) {
  return emitEvent(householdId, "event.created", { eventId }, byMemberId);
}
