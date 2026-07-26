"use client";

import { useEffect, useState } from "react";
import { FileText, FileWarning } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDocumentPreview } from "../actions/get-document-preview";

type PreviewResult = { url: string | null; mimeType: string | null; fileSizeBytes: number | null; title: string };

// Mints a signed URL lazily, on demand, only while the dialog is open —
// never cached (docs/upload.md §6.3): a fresh call every time the dialog
// opens, not reused across renders.
export function DocumentPreviewDialog({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      return;
    }
    getDocumentPreview(documentId)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this file."));
  }, [open, documentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{preview?.title ?? "Document"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !preview && <p className="text-sm text-muted-foreground">Loading…</p>}
        {preview?.url && preview.mimeType?.startsWith("image/") && (
          // A signed URL is a one-time-use, expiring value — next/image's
          // remote-loader allowlist and long-lived cache don't fit a URL
          // that's dead in 5 minutes.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={preview.title} className="max-h-[70vh] w-auto rounded-md border" />
        )}
        {preview?.url && preview.mimeType === "application/pdf" && (
          <iframe src={preview.url} title={preview.title} className="h-[70vh] w-full rounded-md border" />
        )}
        {preview && !preview.url && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-muted-foreground">
            <FileWarning className="h-8 w-8" />
            <p>{preview.title} — file unavailable. Try re-uploading it.</p>
          </div>
        )}
        {preview?.url && !preview.mimeType?.startsWith("image/") && preview.mimeType !== "application/pdf" && (
          <a href={preview.url} className="flex items-center gap-2 text-primary underline">
            <FileText className="h-4 w-4" /> Download {preview.title}
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
