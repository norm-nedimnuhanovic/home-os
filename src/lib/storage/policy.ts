// No "server-only" here — these constants are also imported client-side for
// the pre-upload UX check (docs/upload.md §4.2) before the real,
// server-enforced check runs.
export const DOCUMENTS_BUCKET = "documents" as const;

// plan.md §9 Q27: fixed platform-wide limit, not household-configurable.
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic", // phone camera photos of a receipt/warranty label, iOS default format
] as const;
export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export type DocumentPolicyResult = { ok: true } | { ok: false; reason: string };

export function checkDocumentUploadPolicy(input: { mimeType: string; fileSizeBytes: number }): DocumentPolicyResult {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(input.mimeType as AllowedDocumentMimeType)) {
    return { ok: false, reason: "Only PDF or image files (JPEG, PNG, WebP, HEIC) are accepted." };
  }
  if (input.fileSizeBytes > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return { ok: false, reason: "Files must be 10MB or smaller." };
  }
  return { ok: true };
}
