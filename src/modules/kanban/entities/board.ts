import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const createBoardInputSchema = z
  .object({
    name: z.string().min(1).max(60),
    description: z.string().max(2000).optional(),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);

// updateBoard reuses createBoardInputSchema (docs/forms.md §1, same
// convention established for Task) — the edit form is always pre-filled
// with the board's full current values, so an update is a full replace.
export type CreateBoardInput = z.infer<typeof createBoardInputSchema>;
export type CreateBoardFormInput = z.input<typeof createBoardInputSchema>;
