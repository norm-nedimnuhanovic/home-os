"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET, checkDocumentUploadPolicy } from "@/lib/storage/policy";
import { getDocument } from "../queries/get-document";

export async function confirmDocumentReplace(
  documentId: string,
  input: { newPath: string; mimeType: string; fileSizeBytes: number },
) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getDocument(member, documentId); // tenant + visibility check

  if (existing.uploadedById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the uploader or a household admin/owner can replace this file.");
  }

  const policy = checkDocumentUploadPolicy(input);
  if (!policy.ok) throw new Error(policy.reason);

  const oldPath = existing.fileRef;

  const document = await prisma.document.update({
    where: { id: documentId, householdId: member.householdId },
    data: { fileRef: input.newPath, mimeType: input.mimeType, fileSizeBytes: input.fileSizeBytes },
  });

  // Only delete the OLD object once the new one is confirmed committed to
  // both Storage and Postgres — never the other order. A failure between
  // "new file uploaded" and this action running just leaves the new object
  // unreferenced (harmless — docs/upload.md §5.6) with the old file intact.
  const supabase = createAdminSupabaseClient();
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([oldPath]);

  revalidatePath("/life-admin/documents");
  return document;
}
