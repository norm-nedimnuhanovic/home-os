"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createEventInputSchema, type CreateEventFormInput } from "../entities/event";
import { emitEventCreated } from "../events/emitters";

export async function createEvent(input: CreateEventFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createEventInputSchema.parse(input);

  const event = await prisma.event.create({
    data: {
      householdId: member.householdId,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      startAt: data.startAt,
      endAt: data.endAt,
      allDay: data.allDay,
      color: data.color ?? null,
      visibility: data.visibility,
      createdById: member.id,
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

  await emitEventCreated(member.householdId, event.id, member.id);

  revalidatePath("/calendar");
  return event;
}
