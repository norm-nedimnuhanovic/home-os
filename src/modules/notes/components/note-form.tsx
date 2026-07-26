"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import { createNoteInputSchema, type CreateNoteFormInput } from "../entities/note";
import { createNote } from "../actions/create-note";
import { updateNote } from "../actions/update-note";
import type { Note } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };
type NoteWithTags = Note & { tags?: { tagId: string }[] };

export function NoteForm({
  note,
  members,
  tags,
  onDone,
}: {
  note?: NoteWithTags;
  members: MemberOption[];
  tags: TagOption[];
  onDone: () => void;
}) {
  const form = useForm<CreateNoteFormInput>({
    resolver: zodResolver(createNoteInputSchema),
    defaultValues: note
      ? {
          title: note.title ?? undefined,
          body: note.body,
          isPinned: note.isPinned,
          tagIds: note.tags?.map((t) => t.tagId) ?? [],
          visibility: note.visibility,
        }
      : {
          title: "",
          body: "",
          isPinned: false,
          tagIds: [],
          visibility: "household",
        },
  });

  async function onSubmit(values: CreateNoteFormInput) {
    try {
      if (note) {
        await updateNote(note.id, values);
        toast.success("Note updated");
      } else {
        await createNote(values);
        toast.success("Note created");
      }
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
              <FormLabel>Title (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Falls back to the first line of the body" />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Body (markdown supported)</FormLabel>
              <FormControl>
                <Textarea {...field} rows={8} />
              </FormControl>
            </FormItem>
          )}
        />

        {tags.length > 0 && (
          <FormField
            control={form.control}
            name="tagIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const value = field.value ?? [];
                    const selected = value.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className="cursor-pointer"
                        onClick={() =>
                          field.onChange(selected ? value.filter((id) => id !== tag.id) : [...value, tag.id])
                        }
                      >
                        <Badge variant={selected ? "default" : "outline"}>{tag.name}</Badge>
                      </button>
                    );
                  })}
                </div>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="isPinned"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Pin to top</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <VisibilityField members={members} />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {note ? "Save changes" : "Create note"}
        </Button>
      </form>
    </Form>
  );
}
