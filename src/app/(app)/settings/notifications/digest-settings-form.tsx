"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { updateDigestSubscription } from "@/lib/notifications/actions/update-preferences";
import type { DigestSubscription } from "@prisma/client";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const digestFormSchema = z
  .object({
    frequency: z.enum(["off", "daily", "weekly"]),
    dayOfWeek: z.enum(DAYS_OF_WEEK).optional(),
    timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === "weekly" && !value.dayOfWeek) {
      ctx.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Pick a day for weekly digests" });
    }
  });
type DigestFormInput = z.infer<typeof digestFormSchema>;

export function DigestSettingsForm({ digestSubscription }: { digestSubscription: DigestSubscription | null }) {
  const form = useForm<DigestFormInput>({
    resolver: zodResolver(digestFormSchema),
    defaultValues: {
      frequency: digestSubscription?.frequency ?? "off",
      dayOfWeek: digestSubscription?.dayOfWeek ?? undefined,
      timeOfDay: digestSubscription?.timeOfDay ?? "07:00",
    },
  });
  const frequency = form.watch("frequency");

  async function onSubmit(values: DigestFormInput) {
    try {
      await updateDigestSubscription(values);
    } catch (err) {
      form.setError("root", { message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-lg border p-4 sm:max-w-md">
        <h2 className="text-lg font-medium">Digest email</h2>

        <FormField
          control={form.control}
          name="frequency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Frequency</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {frequency === "weekly" && (
          <FormField
            control={form.control}
            name="dayOfWeek"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Day of week</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a day" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day[0].toUpperCase() + day.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {frequency !== "off" && (
          <FormField
            control={form.control}
            name="timeOfDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time of day</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {form.formState.isSubmitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  );
}
