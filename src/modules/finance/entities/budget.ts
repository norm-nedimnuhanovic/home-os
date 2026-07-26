import { z } from "zod";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

export const budgetPeriodSchema = z.enum(["weekly", "monthly", "yearly"]);

export const createBudgetInputSchema = z.object({
  categoryId: z.string().cuid(),
  memberId: z.string().cuid().optional(), // null/undefined = whole-household budget
  period: budgetPeriodSchema.default("monthly"),
  amount: z.number().positive(),
  effectiveFrom: z.date(),
  endDate: z.date().optional(),
  alertThresholdPercent: z.number().int().min(1).max(100).default(80),
  alertOnExceeded: z.boolean().default(true),
});
export type CreateBudgetInput = z.infer<typeof createBudgetInputSchema>;
export type CreateBudgetFormInput = z.input<typeof createBudgetInputSchema>;

// docs/recipes.md §4.2's sweep example calls this directly — the exact
// period-boundary math is this entity's own concern, not the job's.
export function getCurrentPeriodRange(
  period: "weekly" | "monthly" | "yearly",
  asOf: Date = new Date(),
): { start: Date; end: Date } {
  if (period === "weekly") return { start: startOfWeek(asOf), end: endOfWeek(asOf) };
  if (period === "yearly") return { start: startOfYear(asOf), end: endOfYear(asOf) };
  return { start: startOfMonth(asOf), end: endOfMonth(asOf) };
}
