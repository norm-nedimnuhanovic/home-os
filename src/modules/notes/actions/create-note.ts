"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createNoteInputSchema, type CreateNoteFormInput } from "../entities/note";
import { emitNoteCreated } from "../events/emitters";

export async function createNote(input: CreateNoteFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createNoteInputSchema.parse(input);

  const note = await prisma.note.create({
    data: {
      householdId: member.householdId,
      authorMemberId: member.id,
      title: data.title ?? null,
      body: data.body,
      noteType: "standard",
      isPinned: data.isPinned,
      visibility: data.visibility,
      tags: {
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

  await emitNoteCreated(member.householdId, note.id, member.id);

  revalidatePath("/notes");
  return note;
}
