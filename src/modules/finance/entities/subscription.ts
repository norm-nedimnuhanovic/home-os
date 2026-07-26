import { z } from "zod";
import { addDays, addWeeks, addMonths, addQuarters, addYears } from "date-fns";

export const subscriptionFrequencySchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);

export const createSubscriptionInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    merchant: z.string().max(120).optional(),
    categoryId: z.string().cuid(),
    amount: z.number().positive(),
    variableAmount: z.boolean().default(false),
    frequency: subscriptionFrequencySchema.default("monthly"),
    customIntervalDays: z.number().int().positive().optional(),
    startDate: z.date(),
    endDate: z.date().optional(),
    alertDaysBefore: z.number().int().min(0).default(3),
    responsibleMemberId: z.string().cuid(),
    autoCreateTransaction: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === "custom" && !data.customIntervalDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customIntervalDays"],
        message: "Required when frequency is custom.",
      });
    }
  });
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionInputSchema>;
export type CreateSubscriptionFormInput = z.input<typeof createSubscriptionInputSchema>;

// "Recalculated from frequency after each occurrence marked paid" (plan.md §3.4).
export function computeNextDueDate(
  from: Date,
  frequency: z.infer<typeof subscriptionFrequencySchema>,
  customIntervalDays?: number | null,
): Date {
  switch (frequency) {
    case "weekly":
      return addWeeks(from, 1);
    case "biweekly":
      return addWeeks(from, 2);
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addQuarters(from, 1);
    case "yearly":
      return addYears(from, 1);
    case "custom":
      return addDays(from, customIntervalDays ?? 30);
  }
}
