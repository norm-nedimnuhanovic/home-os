import { z } from "zod";

export const noteLinkedEntityTypeSchema = z.enum(["task", "subscription", "event"]);

// linkedEntityModule/linkedEntityType/linkedEntityId is deliberately a
// generic, open shape (plan.md §3.3) so a future module's entities become
// linkable without a schema change — only task/event are actually wireable
// today since Finance (Subscription) isn't built yet.
export const linkNoteInputSchema = z.object({
  linkedEntityModule: z.string().min(1),
  linkedEntityType: noteLinkedEntityTypeSchema,
  linkedEntityId: z.string().cuid(),
});
export type LinkNoteInput = z.infer<typeof linkNoteInputSchema>;
