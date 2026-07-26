"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { checkDocumentUploadPolicy } from "@/lib/storage/policy";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import {
  documentMetadataInputSchema,
  type DocumentMetadataFormInput,
  DOCUMENT_VISIBILITY_SCOPE,
} from "../entities/document";
import { emitDocumentUploaded, emitDocumentLinked } from "../events/emitters";

type ConfirmDocumentUploadInput = DocumentMetadataFormInput & {
  documentId: string;
  path: string;
  mimeType: string;
  fileSizeBytes: number;
};

// Step 2 of the request→confirm flow (docs/upload.md §5.4) — the Document
// row is only ever created here, after the bytes are already committed to
// Storage. The upload-policy check re-runs here too (not just in
// requestDocumentUpload) — the round trip between the two steps isn't
// trusted.
export async function confirmDocumentUpload(input: ConfirmDocumentUploadInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const policy = checkDocumentUploadPolicy(input);
  if (!policy.ok) throw new Error(policy.reason);

  const data = documentMetadataInputSchema.parse(input);

  const document = await prisma.document.create({
    data: {
      id: input.documentId, // pre-generated in requestDocumentUpload
      householdId: member.householdId,
      title: data.title,
      fileRef: input.path,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      category: data.category,
      description: data.description ?? null,
      linkedEntityType: data.linkedEntityType ?? null,
      linkedEntityId: data.linkedEntityId ?? null,
      uploadedById: member.id,
      visibility: data.visibility,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: DOCUMENT_VISIBILITY_SCOPE.moduleKey,
      objectType: DOCUMENT_VISIBILITY_SCOPE.objectType,
      objectId: document.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  await emitDocumentUploaded(member.householdId, document.id, document.title, member.id);
  if (data.linkedEntityType && data.linkedEntityId) {
    await emitDocumentLinked(member.householdId, document.id, data.linkedEntityType, data.linkedEntityId, member.id);
  }

  revalidatePath("/life-admin/documents");
  return document;
}
