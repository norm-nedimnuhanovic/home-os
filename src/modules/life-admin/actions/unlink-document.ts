"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { getDocument } from "../queries/get-document";

export async function unlinkDocument(documentId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getDocument(member, documentId);

  if (existing.uploadedById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the uploader or a household admin/owner can unlink this document.");
  }

  const document = await prisma.document.update({
    where: { id: documentId, householdId: member.householdId },
    data: { linkedEntityType: null, linkedEntityId: null },
  });

  revalidatePath("/life-admin/documents");
  return document;
}
