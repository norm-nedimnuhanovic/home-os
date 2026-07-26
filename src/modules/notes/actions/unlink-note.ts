"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/access/errors";
import { getNote } from "../queries/get-note";

export async function unlinkNote(noteId: string, noteLinkId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getNote(member, noteId);
  if (existing.authorMemberId !== member.id) {
    throw new ForbiddenError("Only the note's author can remove a link.");
  }

  const link = await prisma.noteLink.findFirst({
    where: { id: noteLinkId, householdId: member.householdId, noteId },
  });
  if (!link) throw new NotFoundError("Link not found.");

  await prisma.noteLink.delete({ where: { id: noteLinkId, householdId: member.householdId } });

  revalidatePath(`/notes/${noteId}`);
}
