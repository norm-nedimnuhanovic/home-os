"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET, checkDocumentUploadPolicy } from "@/lib/storage/policy";
import { requestDocumentReplace } from "../actions/request-document-replace";
import { confirmDocumentReplace } from "../actions/confirm-document-replace";

export function ReplaceDocumentDialog({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleReplace() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    const policy = checkDocumentUploadPolicy({ mimeType: file.type, fileSizeBytes: file.size });
    if (!policy.ok) {
      setError(policy.reason);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const { path, token } = await requestDocumentReplace(documentId, {
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });

      const supabase = createBrowserSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      await confirmDocumentReplace(documentId, { newPath: path, mimeType: file.type, fileSizeBytes: file.size });

      setFile(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace file</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleReplace} disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? "Uploading…" : "Replace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
