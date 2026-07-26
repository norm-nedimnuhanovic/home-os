import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

// Includes the parent Reminder — every occurrence action needs it to check
// "is the acting member this reminder's target" (Reminder has no
// visibility/ObjectShare contract of its own; docs/access-control.md §5.1's
// visibility-carrying list deliberately excludes it).
export async function getOccurrence(householdId: string, occurrenceId: string) {
  const occurrence = await prisma.reminderOccurrence.findFirst({
    where: { id: occurrenceId, householdId }, // both, always — not just id
    include: { reminder: true },
  });
  if (!occurrence) throw new NotFoundError("Reminder occurrence not found.");
  return occurrence;
}
