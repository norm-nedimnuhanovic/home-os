"use server";

import { randomUUID } from "node:crypto";
import { requireMember } from "@/lib/auth/session";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkDocumentUploadPolicy, DOCUMENTS_BUCKET } from "@/lib/storage/policy";
import { buildDocumentObjectPath } from "@/lib/storage/paths";

// Step 1 of the request→confirm upload flow (docs/upload.md §5): mints a
// signed upload URL so the browser can PUT the file bytes directly to
// Supabase Storage, bypassing Vercel's serverless function body-size limit
// entirely. Doesn't touch Postgres yet — confirmDocumentUpload does that,
// only after the bytes are already committed to Storage.
export async function requestDocumentUpload(input: { fileName: string; mimeType: string; fileSizeBytes: number }) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const policy = checkDocumentUploadPolicy(input);
  if (!policy.ok) throw new Error(policy.reason);

  // Pre-generate the id: Document.id is @default(cuid()) in the schema, but
  // we need a stable id before the row exists, to build the object path
  // it's uploaded into. Prisma accepts any unique string as an explicit
  // `id` at create time (confirmDocumentUpload) — it only auto-generates
  // one when omitted.
  const documentId = randomUUID();
  const path = buildDocumentObjectPath(member.householdId, documentId, input.fileName);

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not prepare upload: ${error?.message ?? "unknown error"}`);

  return { documentId, path, token: data.token };
}
