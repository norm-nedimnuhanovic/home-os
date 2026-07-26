"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import {
  createSubscriptionInputSchema,
  subscriptionFrequencySchema,
  type CreateSubscriptionFormInput,
} from "../entities/subscription";
import { createSubscription } from "../actions/create-subscription";
import { updateSubscription } from "../actions/update-subscription";
import type { Subscription } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };

export function SubscriptionForm({
  subscription,
  members,
  categories,
  actingMemberId,
  onDone,
}: {
  subscription?: Subscription;
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
  onDone: () => void;
}) {
  const form = useForm<CreateSubscriptionFormInput>({
    resolver: zodResolver(createSubscriptionInputSchema),
    defaultValues: subscription
      ? {
          name: subscription.name,
          merchant: subscription.merchant ?? undefined,
          categoryId: subscription.categoryId,
          amount: Number(subscription.amount),
          variableAmount: subscription.variableAmount,
          frequency: subscription.frequency,
          customIntervalDays: subscription.customIntervalDays ?? undefined,
          startDate: subscription.startDate,
          endDate: subscription.endDate ?? undefined,
          alertDaysBefore: subscription.alertDaysBefore,
          responsibleMemberId: subscription.responsibleMemberId,
          autoCreateTransaction: subscription.autoCreateTransaction,
        }
      : {
          name: "",
          amount: 0,
          variableAmount: false,
          frequency: "monthly",
          startDate: new Date(),
          alertDaysBefore: 3,
          // The acting member, not members[0] — see the same fix in
          // transaction-form.tsx (a real browser-test-caught bug).
          responsibleMemberId: actingMemberId,
          autoCreateTransaction: false,
        },
  });

  const frequency = form.watch("frequency");

  async function onSubmit(values: CreateSubscriptionFormInput) {
    try {
      if (subscription) {
        await updateSubscription(subscription.id, values);
        toast.success("Subscription updated");
      } else {
        await createSubscription(values);
        toast.success("Subscription created");
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="categoryId"
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
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
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
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    {subscriptionFrequencySchema.options.map((f) => (
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

          {frequency === "custom" && (
            <FormField
              control={form.control}
              name="customIntervalDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Every N days</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start date</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="responsibleMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Responsible</FormLabel>
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
        </div>

        <FormField
          control={form.control}
          name="alertDaysBefore"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alert days before due</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  value={field.value ?? 3}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="autoCreateTransaction"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Auto-create transaction when due</FormLabel>
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
          {subscription ? "Save changes" : "Add subscription"}
        </Button>
      </form>
    </Form>
  );
}
