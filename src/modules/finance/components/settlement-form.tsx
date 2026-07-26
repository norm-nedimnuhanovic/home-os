"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import { createSettlementInputSchema, type CreateSettlementFormInput } from "../entities/settlement";
import { createSettlement } from "../actions/create-settlement";

type MemberOption = { id: string; displayName: string };

export function SettlementForm({
  members,
  actingMemberId,
  defaultFromMemberId,
  defaultToMemberId,
  defaultAmount,
  onDone,
}: {
  members: MemberOption[];
  actingMemberId?: string;
  defaultFromMemberId?: string;
  defaultToMemberId?: string;
  defaultAmount?: number;
  onDone: () => void;
}) {
  // The acting member, not members[0] — same fix as transaction-form.tsx's
  // paidById default (a real browser-test-caught bug). Not load-bearing for
  // an authorization check here (unlike Transaction.paidById), but still the
  // sensible default: the person recording a settlement is usually a party
  // to it.
  const from = defaultFromMemberId ?? actingMemberId ?? members[0]?.id;
  const to = defaultToMemberId ?? members.find((m) => m.id !== from)?.id;

  const form = useForm<CreateSettlementFormInput>({
    resolver: zodResolver(createSettlementInputSchema),
    defaultValues: {
      fromMemberId: from,
      toMemberId: to,
      amount: defaultAmount ?? 0,
      date: new Date(),
    },
  });

  async function onSubmit(values: CreateSettlementFormInput) {
    try {
      await createSettlement(values);
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="fromMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>From (pays)</FormLabel>
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

          <FormField
            control={form.control}
            name="toMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>To (receives)</FormLabel>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="method"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Method (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Cash, bank transfer, …" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          Record settlement
        </Button>
      </form>
    </Form>
  );
}
