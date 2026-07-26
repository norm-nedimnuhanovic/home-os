import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const shoppingListTypeSchema = z.enum(["shopping", "household_tasks", "packing", "gift_ideas", "other"]);

export const createShoppingListInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: shoppingListTypeSchema.default("shopping"),
    description: z.string().max(2000).optional(),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);
export type CreateShoppingListInput = z.infer<typeof createShoppingListInputSchema>;
export type CreateShoppingListFormInput = z.input<typeof createShoppingListInputSchema>;

export const SHOPPING_LIST_VISIBILITY_SCOPE = {
  moduleKey: "life_admin",
  objectType: "ShoppingList",
  ownerField: "createdById",
} as const;
