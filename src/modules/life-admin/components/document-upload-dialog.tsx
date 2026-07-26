"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { DOCUMENTS_BUCKET, checkDocumentUploadPolicy } from "@/lib/storage/policy";
import { documentMetadataInputSchema, documentCategorySchema, type DocumentMetadataFormInput } from "../entities/document";
import { requestDocumentUpload } from "../actions/request-document-upload";
import { confirmDocumentUpload } from "../actions/confirm-document-upload";

type MemberOption = { id: string; displayName: string };

export function DocumentUploadDialog({ members }: { members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const form = useForm<DocumentMetadataFormInput>({
    resolver: zodResolver(documentMetadataInputSchema),
    defaultValues: { title: "", category: "other", visibility: "household" },
  });

  async function onSubmit(values: DocumentMetadataFormInput) {
    if (!file) {
      setFileError("Choose a file to upload.");
      return;
    }
    const policy = checkDocumentUploadPolicy({ mimeType: file.type, fileSizeBytes: file.size });
    if (!policy.ok) {
      setFileError(policy.reason);
      return;
    }
    setFileError(null);

    try {
      const { documentId, path, token } = await requestDocumentUpload({
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });

      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;

      await confirmDocumentUpload({ ...values, documentId, path, mimeType: file.type, fileSizeBytes: file.size });

      setOpen(false);
      setFile(null);
      form.reset();
    } catch (err) {
      form.setError("root", {
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">Upload document</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">File (PDF, JPEG, PNG, WebP, HEIC — up to 10MB)</label>
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {documentCategorySchema.options.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <VisibilityField members={members} />

            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}

            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
              Upload
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
