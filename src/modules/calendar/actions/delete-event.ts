"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getEvent } from "../queries/get-event";

export async function deleteEvent(eventId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getEvent(member.householdId, eventId);

  if (existing.createdById !== member.id) {
    throw new ForbiddenError("Only the event's creator can delete it.");
  }

  // Events are one-off and never "completed" (plan.md §3.2) — a real delete,
  // not a soft-archive like KanbanBoard.
  await prisma.event.delete({ where: { id: eventId, householdId: member.householdId } });

  revalidatePath("/calendar");
}
