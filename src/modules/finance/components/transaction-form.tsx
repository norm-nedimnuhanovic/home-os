"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DateField } from "@/components/date-field";
import { VisibilityField } from "@/lib/household/components/visibility-field";
import {
  createTransactionInputSchema,
  transactionTypeSchema,
  splitTypeSchema,
  type CreateTransactionFormInput,
} from "../entities/transaction";
import { createTransaction } from "../actions/create-transaction";
import { updateTransaction } from "../actions/update-transaction";
import { SplitEditor } from "./split-editor";
import type { Transaction, TransactionSplit } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type CategoryOption = { id: string; name: string; type: string };

const SPLIT_TYPE_LABEL: Record<string, string> = {
  none: "No split",
  equal: "Split equally",
  percentage: "Split by percentage",
  custom: "Split by custom amount",
};

export function TransactionForm({
  transaction,
  members,
  categories,
  actingMemberId,
  onDone,
}: {
  transaction?: Transaction & { splits?: TransactionSplit[] };
  members: MemberOption[];
  categories: CategoryOption[];
  actingMemberId: string;
  onDone: () => void;
}) {
  const form = useForm<CreateTransactionFormInput>({
    resolver: zodResolver(createTransactionInputSchema),
    defaultValues: transaction
      ? {
          type: transaction.type,
          amount: Number(transaction.amount),
          categoryId: transaction.categoryId,
          title: transaction.title,
          notes: transaction.notes ?? undefined,
          date: transaction.date,
          paidById: transaction.paidById,
          visibility: transaction.visibility,
          splitType: transaction.splitType,
          splitMemberIds: transaction.splits?.map((s) => s.memberId) ?? [],
          splitShares:
            transaction.splits?.map((s) => ({ memberId: s.memberId, amount: Number(s.shareAmount) })) ?? [],
        }
      : {
          type: "expense",
          title: "",
          amount: 0,
          date: new Date(),
          // The acting member, not members[0] — an alphabetically-first
          // default silently attributed new transactions to the wrong
          // person and locked the real creator out of Edit/Void (a real
          // bug caught via browser testing, since transaction-list.tsx only
          // renders row actions when transaction.paidById === actingMemberId).
          paidById: actingMemberId,
          splitType: "none",
          splitMemberIds: [],
          splitShares: [],
          visibility: "household",
        },
  });

  const type = form.watch("type");
  const amount = form.watch("amount") ?? 0;
  const splitType = form.watch("splitType");
  const splitMemberIds = form.watch("splitMemberIds") ?? [];
  const splitShares = form.watch("splitShares") ?? [];
  const filteredCategories = categories.filter((c) => c.type === type || c.type === "both");

  async function onSubmit(values: CreateTransactionFormInput) {
    try {
      if (transaction) {
        await updateTransaction(transaction.id, values);
      } else {
        await createTransaction(values);
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
                  {transactionTypeSchema.options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

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
                    {filteredCategories.map((c) => (
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
            name="paidById"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid by</FormLabel>
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
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="splitType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Splitting</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {splitTypeSchema.options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SPLIT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {splitType === "equal" && (
          <FormField
            control={form.control}
            name="splitMemberIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Split with</FormLabel>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => {
                    const selected = splitMemberIds.includes(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            selected
                              ? splitMemberIds.filter((id) => id !== member.id)
                              : [...splitMemberIds, member.id],
                          )
                        }
                      >
                        <Badge variant={selected ? "default" : "outline"}>{member.displayName}</Badge>
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {(splitType === "percentage" || splitType === "custom") && (
          <FormField
            control={form.control}
            name="splitShares"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Split with</FormLabel>
                <SplitEditor
                  mode={splitType}
                  totalAmount={amount}
                  members={members}
                  value={splitShares}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <VisibilityField members={members} />

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        )}

        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
          {transaction ? "Save changes" : "Add transaction"}
        </Button>
      </form>
    </Form>
  );
}
