import { z } from "zod";

// Journal entries are always private and always noteType "journal" —
// neither is user-choosable, unlike a standard note's visibility
// (plan.md §4.6: "private for journal notes... overridable per note" refers
// to standard notes; a journal entry's whole point is personal reflection).
export const upsertJournalEntryInputSchema = z.object({
  body: z.string().min(1),
  entryDate: z.date(),
});
export type UpsertJournalEntryInput = z.infer<typeof upsertJournalEntryInputSchema>;
