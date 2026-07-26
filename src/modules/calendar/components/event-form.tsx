"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import { createEventInputSchema, type CreateEventFormInput } from "../entities/event";
import { createEvent } from "../actions/create-event";
import { updateEvent } from "../actions/update-event";
import type { Event } from "@prisma/client";

type MemberOption = { id: string; displayName: string };

// Native <input type="datetime-local"> works in local wall-clock time and
// wants/returns "yyyy-MM-ddTHH:mm" — not the same shape as a Date, and not
// worth a shared component yet since Event is the only entity with a real
// timed (not just date-only) field so far.
function toDatetimeLocalValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function EventForm({
  event,
  defaultDate,
  members,
  onDone,
}: {
  event?: Event;
  defaultDate?: Date;
  members: MemberOption[];
  onDone: () => void;
}) {
  const initialStart = event?.startAt ?? defaultDate ?? new Date();
  const initialEnd = event?.endAt ?? initialStart;

  const form = useForm<CreateEventFormInput>({
    resolver: zodResolver(createEventInputSchema),
    defaultValues: event
      ? {
          title: event.title,
          description: event.description ?? undefined,
          location: event.location ?? undefined,
          startAt: event.startAt,
          endAt: event.endAt,
          allDay: event.allDay,
          color: event.color ?? undefined,
          visibility: event.visibility,
        }
      : {
          title: "",
          description: "",
          location: "",
          startAt: initialStart,
          endAt: initialEnd,
          allDay: false,
          visibility: "household",
        },
  });

  async function onSubmit(values: CreateEventFormInput) {
    try {
      if (event) {
        await updateEvent(event.id, values);
        toast.success("Event updated");
      } else {
        await createEvent(values);
        toast.success("Event created");
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
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
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
          name="allDay"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>All day</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
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
            name="endAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends</FormLabel>
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
        </div>

        <VisibilityField members={members} />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {event ? "Save changes" : "Create event"}
        </Button>
      </form>
    </Form>
  );
}
