import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

// Standard notes only — noteType is always "standard" here, set by the
// action, not the user. Journal entries go through the dedicated
// upsertJournalEntry() capability instead (../actions/upsert-journal-entry.ts),
// since "opening today's entry" is an upsert-by-date flow, not a normal
// create form (plan.md §3.3/§4.6).
export const createNoteInputSchema = z
  .object({
    title: z.string().max(200).optional(),
    body: z.string().min(1),
    isPinned: z.boolean().default(false),
    tagIds: z.array(z.string().cuid()).default([]),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);

// updateNote reuses createNoteInputSchema (docs/forms.md §1, same
// convention established for Task/KanbanBoard/Event) — the edit form is
// always pre-filled with the note's full current values, so an update is a
// full replace.
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;
export type CreateNoteFormInput = z.input<typeof createNoteInputSchema>;
