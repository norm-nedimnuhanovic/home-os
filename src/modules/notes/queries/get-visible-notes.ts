import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import type { NoteType } from "@prisma/client";

export async function getVisibleNotes(
  actingMember: ActingMember,
  filters: { noteType?: NoteType; archived?: boolean; tagId?: string } = {},
) {
  const where = {
    AND: [
      await visibilityWhere(actingMember, {
        moduleKey: "notes",
        objectType: "Note",
        ownerField: "authorMemberId",
      }),
      {
        ...(filters.noteType ? { noteType: filters.noteType } : {}),
        isArchived: filters.archived ?? false,
        ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
      },
    ],
  };

  return prisma.note.findMany({
    where,
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    include: { tags: { include: { tag: true } } },
  });
}
