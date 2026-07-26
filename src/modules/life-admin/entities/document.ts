import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const documentCategorySchema = z.enum([
  "warranty_proof",
  "insurance_policy",
  "id_document",
  "receipt",
  "manual_guide",
  "contract",
  "property_record",
  "other",
]);

export const documentLinkedEntityTypeSchema = z.enum(["renewal", "contact", "subscription", "task", "note", "event"]);

export const documentMetadataInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    category: documentCategorySchema.default("other"),
    description: z.string().max(2000).optional(),
    // Optional at upload time — linkDocument()/unlinkDocument() change this
    // later without re-uploading the file (entities/document.ts's own
    // request/confirm-upload actions accept this same shape for the
    // "link while uploading" shortcut).
    linkedEntityType: documentLinkedEntityTypeSchema.optional(),
    linkedEntityId: z.string().cuid().optional(),
    ...visibilitySchemaFields,
  })
  .superRefine((data, ctx) => {
    refineVisibility(data, ctx);
    if (Boolean(data.linkedEntityType) !== Boolean(data.linkedEntityId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["linkedEntityId"],
        message: "linkedEntityType and linkedEntityId must both be set, or both omitted.",
      });
    }
  });
export type DocumentMetadataInput = z.infer<typeof documentMetadataInputSchema>;
export type DocumentMetadataFormInput = z.input<typeof documentMetadataInputSchema>;

// Metadata only — title/category/description/visibility, no link fields.
// Changing the polymorphic link is a separate, dedicated action
// (linkDocument/unlinkDocument), mirroring Notes' own linkNote/unlinkNote
// split rather than folding it into a generic update.
export const updateDocumentMetadataInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    category: documentCategorySchema.default("other"),
    description: z.string().max(2000).optional(),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);
export type UpdateDocumentMetadataInput = z.infer<typeof updateDocumentMetadataInputSchema>;
export type UpdateDocumentMetadataFormInput = z.input<typeof updateDocumentMetadataInputSchema>;

export const DOCUMENT_VISIBILITY_SCOPE = {
  moduleKey: "life_admin",
  objectType: "Document",
  ownerField: "uploadedById",
} as const;
