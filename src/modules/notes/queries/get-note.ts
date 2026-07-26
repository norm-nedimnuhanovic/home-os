import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";

// Loading through visibilityWhere() *is* the authorization check for reads
// (same reasoning as Contact, docs/access-control.md §5) — being able to
// load it at all means it's visible to this member.
export async function getNote(actingMember: ActingMember, noteId: string) {
  const note = await prisma.note.findFirst({
    where: {
      AND: [
        await visibilityWhere(actingMember, {
          moduleKey: "notes",
          objectType: "Note",
          ownerField: "authorMemberId",
        }),
        { id: noteId },
      ],
    },
    include: {
      tags: { include: { tag: true } },
      links: true,
    },
  });
  if (!note) throw new NotFoundError("Note not found.");
  return note;
}
