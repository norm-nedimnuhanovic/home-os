"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import {
  createRenewalInputSchema,
  renewalTypeSchema,
  renewalRecurrenceSchema,
  type CreateRenewalFormInput,
} from "../entities/renewal";
import { createRenewal } from "../actions/create-renewal";
import { updateRenewal } from "../actions/update-renewal";
import type { Renewal } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type ContactOption = { id: string; name: string };

export function RenewalForm({
  renewal,
  members,
  contacts,
  onDone,
}: {
  renewal?: Renewal;
  members: MemberOption[];
  contacts: ContactOption[];
  onDone: () => void;
}) {
  const form = useForm<CreateRenewalFormInput>({
    resolver: zodResolver(createRenewalInputSchema),
    defaultValues: renewal
      ? {
          title: renewal.title,
          type: renewal.type,
          provider: renewal.provider ?? undefined,
          purchaseOrIssueDate: renewal.purchaseOrIssueDate ?? undefined,
          expiryDate: renewal.expiryDate,
          reminderOffsetsDays: renewal.reminderOffsetsDays,
          recurrence: renewal.recurrence,
          responsibleMemberId: renewal.responsibleMemberId ?? undefined,
          providerContactId: renewal.providerContactId ?? undefined,
          visibility: renewal.visibility,
        }
      : {
          title: "",
          type: "other",
          expiryDate: new Date(),
          reminderOffsetsDays: [30],
          recurrence: "none",
          visibility: "household",
        },
  });

  async function onSubmit(values: CreateRenewalFormInput) {
    try {
      if (renewal) {
        await updateRenewal(renewal.id, values);
      } else {
        await createRenewal(values);
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    {renewalTypeSchema.options.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, " ")}
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
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="purchaseOrIssueDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Purchased/issued (optional)</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiryDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Expiry date</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="reminderOffsetsDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remind (days before expiry)</FormLabel>
              <FormControl>
                <Input
                  value={field.value?.join(", ") ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((n) => !Number.isNaN(n)),
                    )
                  }
                  placeholder="30, 7"
                />
              </FormControl>
              <FormDescription>Comma-separated, e.g. &quot;30, 7&quot; for a 30-day and a 7-day heads-up.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="recurrence"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recurrence</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {renewalRecurrenceSchema.options.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="responsibleMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Responsible (optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
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
              </FormItem>
            )}
          />
        </div>

        {contacts.length > 0 && (
          <FormField
            control={form.control}
            name="providerContactId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Provider contact (optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        <VisibilityField members={members} />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {renewal ? "Save changes" : "Add renewal"}
        </Button>
      </form>
    </Form>
  );
}
