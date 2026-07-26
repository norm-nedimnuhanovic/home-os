import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import { DOCUMENT_VISIBILITY_SCOPE } from "../entities/document";
import type { DocumentCategory, DocumentLinkedEntityType } from "@prisma/client";

export async function getVisibleDocuments(
  actingMember: ActingMember,
  filters: { category?: DocumentCategory; linkedEntityType?: DocumentLinkedEntityType; linkedEntityId?: string } = {},
) {
  return prisma.document.findMany({
    where: {
      AND: [
        await visibilityWhere(actingMember, DOCUMENT_VISIBILITY_SCOPE),
        filters.category ? { category: filters.category } : {},
        filters.linkedEntityType ? { linkedEntityType: filters.linkedEntityType } : {},
        filters.linkedEntityId ? { linkedEntityId: filters.linkedEntityId } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}
