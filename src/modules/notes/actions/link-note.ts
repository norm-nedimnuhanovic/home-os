"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { linkNoteInputSchema, type LinkNoteInput } from "../entities/note-link";
import { getNote } from "../queries/get-note";
import { emitNoteLinked } from "../events/emitters";

export async function linkNote(noteId: string, input: LinkNoteInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getNote(member, noteId);
  if (existing.authorMemberId !== member.id) {
    throw new ForbiddenError("Only the note's author can link it.");
  }

  const data = linkNoteInputSchema.parse(input);

  const link = await prisma.noteLink.create({
    data: {
      householdId: member.householdId,
      noteId,
      linkedEntityModule: data.linkedEntityModule,
      linkedEntityType: data.linkedEntityType,
      linkedEntityId: data.linkedEntityId,
      createdByMemberId: member.id,
      // Polymorphic-target convenience relations, matching linkedEntityType
      // (docs/orm-conventions.md §4) — set the one that applies, leave the
      // others null; not enforced at the DB level.
      ...(data.linkedEntityType === "task" ? { linkedTaskId: data.linkedEntityId } : {}),
      ...(data.linkedEntityType === "event" ? { linkedEventId: data.linkedEntityId } : {}),
      ...(data.linkedEntityType === "subscription" ? { linkedSubscriptionId: data.linkedEntityId } : {}),
    },
  });

  await emitNoteLinked(member.householdId, noteId, data.linkedEntityType, data.linkedEntityId, member.id);

  revalidatePath(`/notes/${noteId}`);
  return link;
}
