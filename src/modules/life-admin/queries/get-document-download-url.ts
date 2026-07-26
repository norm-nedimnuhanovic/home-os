import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DOCUMENTS_BUCKET } from "@/lib/storage/policy";
import type { ActingMember } from "@/lib/auth/session";
import { getDocument } from "./get-document";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — long enough to load a preview/download, short enough not to matter if a link leaks

// The one path to a Document's bytes. Storage access piggybacks entirely on
// getDocument()'s visibility check — there is no second, separate
// permission system for the Storage side (docs/upload.md §6).
export async function getDocumentDownloadUrl(actingMember: ActingMember, documentId: string) {
  const document = await getDocument(actingMember, documentId);

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(document.fileRef, SIGNED_URL_TTL_SECONDS);

  // Graceful, not thrown — a Document row can in principle outlive its
  // Storage object (an abandoned upload, or a manually deleted bucket
  // object); the UI shows "file unavailable" rather than crashing the page.
  if (error || !data) {
    return { url: null, mimeType: document.mimeType, fileSizeBytes: document.fileSizeBytes, title: document.title };
  }

  return {
    url: data.signedUrl,
    mimeType: document.mimeType,
    fileSizeBytes: document.fileSizeBytes,
    title: document.title,
  };
}
