import { z } from "zod";

// Spread into any entity's Zod input schema that carries the shared
// visibility contract (docs/forms.md §3.1). Pairs with visibilityWhere()
// (@/lib/access/visibility) on the read side — this file is the write/form
// side of the same contract.
export const visibilitySchemaFields = {
  visibility: z.enum(["private", "household", "specific_members"]).default("household"),
  // Only read/required when visibility === "specific_members" — see
  // refineVisibility below. Optional here so "household"/"private"
  // submissions don't need to send an empty array.
  sharedWithMemberIds: z.array(z.string().cuid()).optional(),
};

/**
 * Pass to `.superRefine()` on any schema that spreads visibilitySchemaFields
 * in, so "specific_members with zero people picked" is rejected the same
 * way everywhere, instead of each module writing its own version of this
 * check (or forgetting it).
 */
export function refineVisibility(
  data: { visibility: string; sharedWithMemberIds?: string[] },
  ctx: z.RefinementCtx,
) {
  if (data.visibility === "specific_members" && (data.sharedWithMemberIds?.length ?? 0) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sharedWithMemberIds"],
      message: "Pick at least one household member to share with.",
    });
  }
}
