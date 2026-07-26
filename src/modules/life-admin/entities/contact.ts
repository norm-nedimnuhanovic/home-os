import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const contactCategorySchema = z.enum([
  "medical",
  "emergency_services",
  "home_service_provider",
  "insurance_agent",
  "landlord_property_manager",
  "school_childcare",
  "financial_legal",
  "utility_provider",
  "family_friend",
  "other",
]);

function hasAtLeastOneChannel(data: { phone?: string; email?: string; address?: string; website?: string }) {
  return Boolean(data.phone || data.email || data.address || data.website);
}

export const createContactInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    category: contactCategorySchema.default("other"),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional(),
    address: z.string().max(240).optional(),
    website: z.string().url().optional(),
    notes: z.string().max(2000).optional(),
    isPinned: z.boolean().default(false),
    ...visibilitySchemaFields,
  })
  .superRefine((data, ctx) => {
    refineVisibility(data, ctx);
    if (!hasAtLeastOneChannel(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Provide at least one of phone, email, address, or website.",
      });
    }
  });
export type CreateContactInput = z.infer<typeof createContactInputSchema>;
export type CreateContactFormInput = z.input<typeof createContactInputSchema>;

// docs/access-control.md §5.2's table: moduleKey/objectType/ownerField for
// visibilityWhere() — ownerField is the scalar FK column (createdById), not
// the relation name plan.md's prose uses (docs/orm-conventions.md §2.3).
export const CONTACT_VISIBILITY_SCOPE = {
  moduleKey: "life_admin",
  objectType: "Contact",
  ownerField: "createdById",
} as const;
