"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  createManualReminderInputSchema,
  reminderTypeSchema,
  recurrenceFrequencySchema,
  type CreateManualReminderFormInput,
} from "../entities/reminder";
import { createManualReminder } from "../actions/create-manual-reminder";
import { updateReminder } from "../actions/update-reminder";
import type { Reminder } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

// Same native <input type="datetime-local"> convention established for
// Calendar's Event (src/modules/calendar/components/event-form.tsx) — not
// worth a shared component yet, only the second entity to need it.
function toDatetimeLocalValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function ReminderForm({
  reminder,
  members,
  onDone,
}: {
  reminder?: Reminder;
  members: MemberOption[];
  onDone: () => void;
}) {
  const form = useForm<CreateManualReminderFormInput>({
    resolver: zodResolver(createManualReminderInputSchema),
    defaultValues: reminder
      ? {
          title: reminder.title,
          description: reminder.description ?? undefined,
          targetMemberId: reminder.targetMemberId,
          reminderType: reminder.reminderType,
          firstRemindAt: reminder.firstRemindAt,
          recurrenceFrequency: reminder.recurrenceFrequency ?? undefined,
          recurrenceInterval: reminder.recurrenceInterval ?? 1,
          recurrenceEndDate: reminder.recurrenceEndDate ?? undefined,
          emailEnabled: reminder.emailEnabled,
        }
      : {
          title: "",
          description: "",
          targetMemberId: members[0]?.id,
          reminderType: "one_off",
          firstRemindAt: new Date(),
          recurrenceInterval: 1,
          emailEnabled: true,
        },
  });

  const reminderType = form.watch("reminderType");

  async function onSubmit(values: CreateManualReminderFormInput) {
    try {
      if (reminder) {
        await updateReminder(reminder.id, values);
        toast.success("Reminder updated");
      } else {
        await createManualReminder(values);
        toast.success("Reminder created");
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

        <FormField
          control={form.control}
          name="targetMemberId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remind</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="firstRemindAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First remind at</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    value={field.value ? toDatetimeLocalValue(field.value) : ""}
                    onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reminderType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Repeats</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {reminderTypeSchema.options.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === "one_off" ? "Once" : "Recurring"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>

        {reminderType === "recurring" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="recurrenceFrequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick a frequency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {recurrenceFrequencySchema.options.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f[0].toUpperCase() + f.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recurrenceInterval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Every</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? 1}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="emailEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Email notification</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {reminder ? "Save changes" : "Create reminder"}
        </Button>
      </form>
    </Form>
  );
}
