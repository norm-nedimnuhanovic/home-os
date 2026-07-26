import { redirect } from "next/navigation";
import { startOfDay } from "date-fns";
import { getVisibleNotes, getJournalEntry } from "@/modules/notes";
import { getHouseholdTags } from "@/modules/tasks";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { NoteList } from "@/modules/notes/components/note-list";
import { NewNoteDialog } from "@/modules/notes/components/new-note-dialog";
import { JournalWidget } from "@/modules/notes/components/journal-widget";

export default async function NotesPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const today = startOfDay(new Date());
  const [notes, tags, members, journalEntry] = await Promise.all([
    getVisibleNotes(member, { noteType: "standard" }),
    getHouseholdTags(member.householdId),
    getMembers(member.householdId),
    getJournalEntry(member.householdId, member.id, today),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <NewNoteDialog members={members} tags={tags} />
      </div>
      <JournalWidget initialBody={journalEntry?.body ?? ""} entryDate={today} />
      <NoteList notes={notes} />
    </div>
  );
}
