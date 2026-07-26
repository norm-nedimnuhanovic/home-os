import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";
import { DOCUMENT_VISIBILITY_SCOPE } from "../entities/document";

export async function getDocument(actingMember: ActingMember, documentId: string) {
  const document = await prisma.document.findFirst({
    where: {
      AND: [{ id: documentId }, await visibilityWhere(actingMember, DOCUMENT_VISIBILITY_SCOPE)],
    },
  });
  if (!document) throw new NotFoundError("Document not found.");
  return document;
}
