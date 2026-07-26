"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createEventInputSchema, type CreateEventFormInput } from "../entities/event";
import { getEvent } from "../queries/get-event";

export async function updateEvent(eventId: string, input: CreateEventFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getEvent(member.householdId, eventId);

  // "Manage own data" (docs/access-control.md §4.3) — an event has no
  // assignee concept the way Task does, so this is creator-only.
  if (existing.createdById !== member.id) {
    throw new ForbiddenError("Only the event's creator can edit it.");
  }

  const data = createEventInputSchema.parse(input);

  const event = await prisma.event.update({
    where: { id: eventId, householdId: member.householdId },
    data: {
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      startAt: data.startAt,
      endAt: data.endAt,
      allDay: data.allDay,
      color: data.color ?? null,
      visibility: data.visibility,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: "calendar",
      objectType: "Event",
      objectId: event.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  revalidatePath("/calendar");
  return event;
}
