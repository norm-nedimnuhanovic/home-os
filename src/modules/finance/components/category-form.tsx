"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  createCategoryInputSchema,
  categoryTypeSchema,
  type CreateCategoryFormInput,
} from "../entities/category";
import { createCategory } from "../actions/create-category";
import { updateCategory } from "../actions/update-category";
import type { Category } from "@prisma/client";

export function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const form = useForm<CreateCategoryFormInput>({
    resolver: zodResolver(createCategoryInputSchema),
    defaultValues: category
      ? { name: category.name, type: category.type, color: category.color ?? undefined, icon: category.icon ?? undefined }
      : { name: "", type: "expense" },
  });

  async function onSubmit(values: CreateCategoryFormInput) {
    try {
      if (category) {
        await updateCategory(category.id, values);
        toast.success("Category updated");
      } else {
        await createCategory(values);
        toast.success("Category created");
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
                  {categoryTypeSchema.options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {category ? "Save changes" : "Add category"}
        </Button>
      </form>
    </Form>
  );
}
