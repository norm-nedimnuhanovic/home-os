"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import {
  updateDocumentMetadataInputSchema,
  type UpdateDocumentMetadataFormInput,
  DOCUMENT_VISIBILITY_SCOPE,
} from "../entities/document";
import { getDocument } from "../queries/get-document";

// Harness extrapolation: no Q30-style carve-out named for Document, and it
// includes the most sensitive category in the whole plan (id_document), so
// this follows the stricter uploader-or-admin/owner gate rather than
// Contact's "anyone with visibility" rule.
export async function updateDocumentMetadata(documentId: string, input: UpdateDocumentMetadataFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getDocument(member, documentId);

  if (existing.uploadedById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the uploader or a household admin/owner can edit this document.");
  }

  const data = updateDocumentMetadataInputSchema.parse(input);

  const document = await prisma.document.update({
    where: { id: documentId, householdId: member.householdId },
    data: {
      title: data.title,
      category: data.category,
      description: data.description ?? null,
      visibility: data.visibility,
    },
  });

  await syncObjectShares({
    householdId: member.householdId,
    moduleKey: DOCUMENT_VISIBILITY_SCOPE.moduleKey,
    objectType: DOCUMENT_VISIBILITY_SCOPE.objectType,
    objectId: document.id,
    sharedByMemberId: member.id,
    sharedWithMemberIds: data.visibility === "specific_members" ? data.sharedWithMemberIds ?? [] : [],
  });

  // No document.updated event — plan.md §4.8's Emits: line for Life Admin
  // only lists document.uploaded/document.linked, not an update event; don't
  // register one it doesn't ask for.
  revalidatePath("/life-admin/documents");
  return document;
}
