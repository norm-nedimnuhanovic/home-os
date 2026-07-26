"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import {
  updateDocumentMetadataInputSchema,
  documentCategorySchema,
  type UpdateDocumentMetadataFormInput,
} from "../entities/document";
import { updateDocumentMetadata } from "../actions/update-document-metadata";
import type { Document } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

export function DocumentMetadataForm({
  document,
  members,
  onDone,
}: {
  document: Document;
  members: MemberOption[];
  onDone: () => void;
}) {
  const form = useForm<UpdateDocumentMetadataFormInput>({
    resolver: zodResolver(updateDocumentMetadataInputSchema),
    defaultValues: {
      title: document.title,
      category: document.category,
      description: document.description ?? undefined,
      visibility: document.visibility,
    },
  });

  async function onSubmit(values: UpdateDocumentMetadataFormInput) {
    try {
      await updateDocumentMetadata(document.id, values);
      toast.success("Document updated");
      onDone();
    } catch (err) {
      form.setError("root", {
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
          Save changes
        </Button>
      </form>
    </Form>
  );
}
