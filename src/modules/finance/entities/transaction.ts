import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";
import { splitsSumMatches } from "./split";

export const transactionTypeSchema = z.enum(["expense", "income"]);
export const splitTypeSchema = z.enum(["none", "equal", "percentage", "custom"]);

const splitShareSchema = z.object({
  memberId: z.string().cuid(),
  amount: z.number().positive(),
});

export const createTransactionInputSchema = z
  .object({
    type: transactionTypeSchema.default("expense"),
    amount: z.number().positive(),
    categoryId: z.string().cuid(),
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
    date: z.date(),
    paidById: z.string().cuid(),
    splitType: splitTypeSchema.default("none"),
    // "equal" only needs who's splitting it — the amount is computed
    // server-side (computeEqualSplits). "percentage"/"custom" both resolve
    // to explicit amounts client-side before submit (plan.md §3.4:
    // sharePercent is "a derived display value, not authoritative") — one
    // canonical shape server-side rather than two.
    splitMemberIds: z.array(z.string().cuid()).default([]),
    splitShares: z.array(splitShareSchema).default([]),
    ...visibilitySchemaFields,
  })
  .superRefine((data, ctx) => {
    refineVisibility(data, ctx);

    if (data.splitType === "equal" && data.splitMemberIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splitMemberIds"],
        message: "Pick at least one member to split this with.",
      });
    }

    if ((data.splitType === "percentage" || data.splitType === "custom") && data.splitShares.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splitShares"],
        message: "Add at least one member's share.",
      });
    }

    if (data.splitShares.length > 0 && !splitsSumMatches(data.amount, data.splitShares)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["splitShares"],
        message: "Split amounts must add up to the transaction total.",
      });
    }
  });

// updateTransaction reuses createTransactionInputSchema (docs/forms.md §1) —
// the edit form is always pre-filled with the transaction's full current
// values, so an update is a full replace.
export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;
export type CreateTransactionFormInput = z.input<typeof createTransactionInputSchema>;
