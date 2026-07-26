"use server";

import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkDocumentUploadPolicy, DOCUMENTS_BUCKET } from "@/lib/storage/policy";
import { buildDocumentObjectPath } from "@/lib/storage/paths";
import { getDocument } from "../queries/get-document";

// Replacing a file in place (docs/upload.md §5.5) — same request→confirm
// shape as a brand-new upload, but against an existing documentId. The OLD
// object at document.fileRef is left completely untouched until
// confirmDocumentReplace commits the new one.
export async function requestDocumentReplace(
  documentId: string,
  input: { fileName: string; mimeType: string; fileSizeBytes: number },
) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const document = await getDocument(member, documentId); // tenant + visibility check

  if (document.uploadedById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the uploader or a household admin/owner can replace this file.");
  }

  const policy = checkDocumentUploadPolicy(input);
  if (!policy.ok) throw new Error(policy.reason);

  const path = buildDocumentObjectPath(member.householdId, documentId, input.fileName);

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not prepare upload: ${error?.message ?? "unknown error"}`);

  return { path, token: data.token };
}
