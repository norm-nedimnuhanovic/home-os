"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import {
  createShoppingListInputSchema,
  shoppingListTypeSchema,
  type CreateShoppingListFormInput,
} from "../entities/shopping-list";
import { createShoppingList } from "../actions/create-shopping-list";
import { updateShoppingList } from "../actions/update-shopping-list";
import type { ShoppingList } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

export function ShoppingListForm({
  list,
  members,
  onDone,
}: {
  list?: ShoppingList;
  members: MemberOption[];
  onDone: () => void;
}) {
  const form = useForm<CreateShoppingListFormInput>({
    resolver: zodResolver(createShoppingListInputSchema),
    defaultValues: list
      ? { name: list.name, type: list.type, description: list.description ?? undefined, visibility: list.visibility }
      : { name: "", type: "shopping", visibility: "household" },
  });

  async function onSubmit(values: CreateShoppingListFormInput) {
    try {
      if (list) {
        await updateShoppingList(list.id, values);
      } else {
        await createShoppingList(values);
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {shoppingListTypeSchema.options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
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
          {list ? "Save changes" : "Create list"}
        </Button>
      </form>
    </Form>
  );
}
