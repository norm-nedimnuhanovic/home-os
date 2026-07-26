"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import {
  createTaskInputSchema,
  taskPrioritySchema,
  type CreateTaskFormInput,
} from "../entities/task";
import { createTask } from "../actions/create-task";
import { updateTask } from "../actions/update-task";
// Imported directly, not the reminders barrel — same reason as
// entities/task.ts's leadTimeUnitSchema import (this is a "use client" file).
import { leadTimeUnitSchema } from "@/modules/reminders/entities/reminder";
import type { Task } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };
type DueReminder = { leadTimeValue: number | null; leadTimeUnit: (typeof leadTimeUnitSchema.options)[number] | null };

export function TaskForm({
  task,
  members,
  tags,
  onDone,
}: {
  task?: Task & { tagIds?: string[]; dueReminder?: DueReminder | null };
  members: MemberOption[];
  tags: TagOption[];
  onDone: () => void;
}) {
  // useForm's generic is the zod *input* type (pre-.default()), matching
  // what zodResolver actually expects — z.infer/CreateTaskInput is the
  // *output* type (post-defaults) and doesn't type-check here.
  const form = useForm<CreateTaskFormInput>({
    resolver: zodResolver(createTaskInputSchema),
    defaultValues: task
      ? {
          title: task.title,
          description: task.description ?? undefined,
          dueDate: task.dueDate ?? undefined,
          dueDateAllDay: task.dueDateAllDay,
          priority: task.priority,
          assigneeId: task.assigneeId ?? undefined,
          tagIds: task.tagIds ?? [],
          visibility: task.visibility,
          remindBeforeDue: !!task.dueReminder,
          remindLeadTimeValue: task.dueReminder?.leadTimeValue ?? 1,
          remindLeadTimeUnit: task.dueReminder?.leadTimeUnit ?? "days",
        }
      : {
          title: "",
          description: "",
          priority: "medium",
          dueDateAllDay: true,
          tagIds: [],
          visibility: "household",
          remindBeforeDue: false,
          remindLeadTimeValue: 1,
          remindLeadTimeUnit: "days",
        },
  });

  const dueDate = form.watch("dueDate");
  const remindBeforeDue = form.watch("remindBeforeDue");

  async function onSubmit(values: CreateTaskFormInput) {
    try {
      if (task) {
        await updateTask(task.id, values);
        toast.success("Task updated");
      } else {
        await createTask(values);
        toast.success("Task created");
      }
      onDone();
    } catch (err) {
      // Standard error-surfacing convention for every form: a rejected
      // Server Action (a thrown ForbiddenError/NotFoundError, or a zod
      // re-validation failure the client somehow missed) sets a root-level
      // react-hook-form error rather than an unhandled exception reaching
      // the user.
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Due date</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {taskPrioritySchema.options.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="dueDateAllDay"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>All day</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {dueDate && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <FormField
              control={form.control}
              name="remindBeforeDue"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>Remind me before due date</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {remindBeforeDue && (
              <div className="flex items-end gap-2">
                <FormField
                  control={form.control}
                  name="remindLeadTimeValue"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Lead time</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          value={field.value}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remindLeadTimeUnit"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {leadTimeUnitSchema.options.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        )}

        <FormField
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assignee</FormLabel>
              {/* Radix Select can't take an empty-string item value, so
                  "unassigned" is a sentinel mapped back to undefined —
                  assigneeId stays optional/null in the schema and on Task. */}
              <Select
                onValueChange={(value) => field.onChange(value === "unassigned" ? undefined : value)}
                defaultValue={field.value ?? "unassigned"}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

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

        <VisibilityField members={members} />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {task ? "Save changes" : "Add task"}
        </Button>
      </form>
    </Form>
  );
}
