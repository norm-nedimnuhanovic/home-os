import { emitEvent } from "@/lib/events/emit";

export async function emitNoteCreated(householdId: string, noteId: string, byMemberId: string) {
  return emitEvent(householdId, "note.created", { noteId }, byMemberId);
}

export async function emitNoteLinked(
  householdId: string,
  noteId: string,
  linkedEntityType: string,
  linkedEntityId: string,
  byMemberId: string,
) {
  return emitEvent(householdId, "note.linked", { noteId, linkedEntityType, linkedEntityId }, byMemberId);
}
