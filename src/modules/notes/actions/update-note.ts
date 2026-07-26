"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createNoteInputSchema, type CreateNoteFormInput } from "../entities/note";
import { getNote } from "../queries/get-note";

export async function updateNote(noteId: string, input: CreateNoteFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // Loading through getNote() checks visibility (can this member see it at
  // all); editing is stricter still — author-only, since Note has no
  // assignee concept the way Task does (docs/access-control.md §4.3).
  const existing = await getNote(member, noteId);
  if (existing.authorMemberId !== member.id) {
    throw new ForbiddenError("Only the note's author can edit it.");
  }

  const data = createNoteInputSchema.parse(input);

  const note = await prisma.note.update({
    where: { id: noteId, householdId: member.householdId },
    data: {
      title: data.title ?? null,
      body: data.body,
      isPinned: data.isPinned,
      visibility: data.visibility,
      tags: {
        deleteMany: {},
        create: data.tagIds.map((tagId) => ({ tagId, householdId: member.householdId })),
      },
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: "notes",
      objectType: "Note",
      objectId: note.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
  return note;
}
