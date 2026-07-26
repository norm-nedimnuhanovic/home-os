import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

export async function getReminder(householdId: string, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, householdId }, // both, always — not just id
  });
  if (!reminder) throw new NotFoundError("Reminder not found.");
  return reminder;
}
