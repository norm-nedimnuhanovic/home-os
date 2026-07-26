// The public barrel: the ONLY import path other modules use
// (docs/project-structure.md §3.2, §7).
export { getVisibleNotes } from "./queries/get-visible-notes";
export { getNote } from "./queries/get-note";
export { getJournalEntry } from "./queries/get-journal-entry";
export { createNote } from "./actions/create-note";
export { updateNote } from "./actions/update-note";
export { archiveNote } from "./actions/archive-note";
export { unarchiveNote } from "./actions/unarchive-note";
export { upsertJournalEntry } from "./actions/upsert-journal-entry";
export { linkNote } from "./actions/link-note";
export { unlinkNote } from "./actions/unlink-note";
export { createNoteInputSchema } from "./entities/note";
export type { CreateNoteInput, CreateNoteFormInput } from "./entities/note";
export { noteLinkedEntityTypeSchema, linkNoteInputSchema } from "./entities/note-link";
export type { LinkNoteInput } from "./entities/note-link";
// NOT exported: actions/*.test.ts, anything else — internal to this module.
