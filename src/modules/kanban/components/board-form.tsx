"use client";

import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import { createBoardInputSchema, type CreateBoardFormInput } from "../entities/board";
import { createBoard } from "../actions/create-board";
import { updateBoard } from "../actions/update-board";
import type { KanbanBoard } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

export function BoardForm({
  board,
  members,
  onDone,
}: {
  board?: KanbanBoard;
  members: MemberOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<CreateBoardFormInput>({
    resolver: zodResolver(createBoardInputSchema),
    defaultValues: board
      ? {
          name: board.name,
          description: board.description ?? undefined,
          visibility: board.visibility,
        }
      : {
          name: "",
          description: "",
          visibility: "household",
        },
  });

  async function onSubmit(values: CreateBoardFormInput) {
    try {
      if (board) {
        await updateBoard(board.id, values);
        onDone();
      } else {
        const created = await createBoard(values);
        onDone();
        router.push(`/kanban/${created.id}`);
      }
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Board name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
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
          {board ? "Save changes" : "Create board"}
        </Button>
      </form>
    </Form>
  );
}
