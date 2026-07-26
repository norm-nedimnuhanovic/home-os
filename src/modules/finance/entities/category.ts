import { z } from "zod";

export const categoryTypeSchema = z.enum(["expense", "income", "both"]);

export const createCategoryInputSchema = z.object({
  name: z.string().min(1).max(80),
  type: categoryTypeSchema.default("expense"),
  color: z.string().optional(),
  icon: z.string().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type CreateCategoryFormInput = z.input<typeof createCategoryInputSchema>;

// Seeded once per household at signup (plan.md §3.4) — still editable/
// archivable afterward, never re-seeded.
export const STARTER_CATEGORIES: { name: string; type: z.infer<typeof categoryTypeSchema> }[] = [
  { name: "Groceries", type: "expense" },
  { name: "Utilities", type: "expense" },
  { name: "Rent/Mortgage", type: "expense" },
  { name: "Transport", type: "expense" },
  { name: "Entertainment", type: "expense" },
  { name: "Healthcare", type: "expense" },
  { name: "Salary", type: "income" },
  { name: "Other Income", type: "income" },
];
