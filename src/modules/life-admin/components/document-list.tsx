"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentPreviewDialog } from "./document-preview";
import { ReplaceDocumentDialog } from "./replace-document-dialog";
import { DocumentMetadataForm } from "./document-metadata-form";
import { deleteDocument } from "../actions/delete-document";
import type { Document } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

export function DocumentList({ documents, members }: { documents: Document[]; members: MemberOption[] }) {
  const [previewing, setPreviewing] = useState<Document | null>(null);
  const [replacing, setReplacing] = useState<Document | null>(null);
  const [editing, setEditing] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState<Document | null>(null);

  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {documents.map((document) => (
          <li key={document.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <button type="button" className="min-w-0 text-left" onClick={() => setPreviewing(document)}>
              <p className="truncate font-medium">{document.title}</p>
            </button>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{document.category.replace(/_/g, " ")}</Badge>
              {document.linkedEntityType && <Badge variant="secondary">Linked to {document.linkedEntityType}</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(document)}>
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReplacing(document)}>
                Replace file
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleting(document)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {previewing && (
        <DocumentPreviewDialog
          documentId={previewing.id}
          open={!!previewing}
          onOpenChange={(open) => !open && setPreviewing(null)}
        />
      )}

      {replacing && (
        <ReplaceDocumentDialog
          documentId={replacing.id}
          open={!!replacing}
          onOpenChange={(open) => !open && setReplacing(null)}
        />
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit document</DialogTitle>
          </DialogHeader>
          {editing && <DocumentMetadataForm document={editing} members={members} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete document"
        description={
          deleting ? `"${deleting.title}" and its stored file will be permanently deleted. This cannot be undone.` : ""
        }
        confirmLabel="Delete"
        onConfirm={() => deleteDocument(deleting!.id)}
      />
    </>
  );
}
