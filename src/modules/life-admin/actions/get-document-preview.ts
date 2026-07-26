"use server";

import { requireMember } from "@/lib/auth/session";
import { getDocumentDownloadUrl } from "../queries/get-document-download-url";

// getDocumentDownloadUrl() itself is a plain query function (no "use
// server"), meant for Server Component/Server Action callers — this is the
// thin, session-resolving wrapper a client component (the on-demand preview
// dialog, docs/upload.md §6.2: mint lazily, per document, on click) can
// actually invoke.
export async function getDocumentPreview(documentId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  return getDocumentDownloadUrl(member, documentId);
}
