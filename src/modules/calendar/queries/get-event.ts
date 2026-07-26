import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getEvent(householdId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, householdId }, // both, always — not just id
  });
  if (!event) throw new NotFoundError("Event not found.");
  return event;
}
