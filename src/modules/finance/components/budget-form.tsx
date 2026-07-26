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
import { createBudgetInputSchema, budgetPeriodSchema, type CreateBudgetFormInput } from "../entities/budget";
import { createBudget } from "../actions/create-budget";
import { updateBudget } from "../actions/update-budget";
import type { Budget } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string };

export function BudgetForm({
  budget,
  members,
  categories,
  onDone,
}: {
  budget?: Budget;
  members: MemberOption[];
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const form = useForm<CreateBudgetFormInput>({
    resolver: zodResolver(createBudgetInputSchema),
    defaultValues: budget
      ? {
          categoryId: budget.categoryId,
          memberId: budget.memberId ?? undefined,
          period: budget.period,
          amount: Number(budget.amount),
          effectiveFrom: budget.effectiveFrom,
          endDate: budget.endDate ?? undefined,
          alertThresholdPercent: budget.alertThresholdPercent,
          alertOnExceeded: budget.alertOnExceeded,
        }
      : {
          period: "monthly",
          amount: 0,
          effectiveFrom: new Date(),
          alertThresholdPercent: 80,
          alertOnExceeded: true,
        },
  });

  async function onSubmit(values: CreateBudgetFormInput) {
    try {
      if (budget) {
        await updateBudget(budget.id, values);
        toast.success("Budget updated");
      } else {
        await createBudget(values);
        toast.success("Budget created");
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
            name="memberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Applies to</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "household" ? undefined : v)}
                  defaultValue={field.value ?? "household"}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="household">Whole household</SelectItem>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="period"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {budgetPeriodSchema.options.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            name="effectiveFrom"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Effective from</FormLabel>
                <DateField value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End date (optional)</FormLabel>
                <DateField value={field.value} onChange={field.onChange} placeholder="Ongoing" />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="alertThresholdPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alert at % of budget spent</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={field.value ?? 80}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="alertOnExceeded"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Also alert when exceeded</FormLabel>
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
          {budget ? "Save changes" : "Add budget"}
        </Button>
      </form>
    </Form>
  );
}
