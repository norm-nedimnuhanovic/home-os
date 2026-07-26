"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { documentLinkedEntityTypeSchema } from "../entities/document";
import { getDocument } from "../queries/get-document";
import { emitDocumentLinked } from "../events/emitters";
import type { z } from "zod";

export async function linkDocument(
  documentId: string,
  linkedEntityType: z.infer<typeof documentLinkedEntityTypeSchema>,
  linkedEntityId: string,
) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getDocument(member, documentId);

  if (existing.uploadedById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the uploader or a household admin/owner can link this document.");
  }

  const type = documentLinkedEntityTypeSchema.parse(linkedEntityType);

  const document = await prisma.document.update({
    where: { id: documentId, householdId: member.householdId },
    data: { linkedEntityType: type, linkedEntityId },
  });

  await emitDocumentLinked(member.householdId, document.id, type, linkedEntityId, member.id);

  revalidatePath("/life-admin/documents");
  return document;
}
