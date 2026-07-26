import { z } from "zod";

// No visibility fields — a ShoppingListItem is never queried on its own,
// only ever through its parent ShoppingList (already visibility-scoped via
// get-shopping-list.ts), so it carries no independent visibility/owner
// pattern (plan.md §3.5's field list for this entity has neither).
export const createShoppingListItemInputSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.string().max(60).optional(),
  category: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateShoppingListItemInput = z.infer<typeof createShoppingListItemInputSchema>;
export type CreateShoppingListItemFormInput = z.input<typeof createShoppingListItemInputSchema>;

export const updateShoppingListItemInputSchema = createShoppingListItemInputSchema;
export type UpdateShoppingListItemInput = z.infer<typeof updateShoppingListItemInputSchema>;
export type UpdateShoppingListItemFormInput = z.input<typeof updateShoppingListItemInputSchema>;
