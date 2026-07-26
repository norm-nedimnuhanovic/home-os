"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getNote } from "../queries/get-note";

export async function unarchiveNote(noteId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getNote(member, noteId);
  if (existing.authorMemberId !== member.id) {
    throw new ForbiddenError("Only the note's author can unarchive it.");
  }

  const note = await prisma.note.update({
    where: { id: noteId, householdId: member.householdId },
    data: { isArchived: false },
  });

  revalidatePath("/notes");
  return note;
}
