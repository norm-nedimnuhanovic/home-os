import { redirect, notFound } from "next/navigation";
import { addDays, subDays } from "date-fns";
import { getNote } from "@/modules/notes";
import { getCalendarRange } from "@/modules/calendar";
import { getVisibleTasks } from "@/modules/tasks";
import { getMembers } from "@/lib/household";
import { getHouseholdTags } from "@/modules/tasks";
import { requireMember } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/access/errors";
import { NoteDetail } from "@/modules/notes/components/note-detail";

export default async function NoteDetailPage({ params }: { params: Promise<{ noteId: string }> }) {
  const member = await requireMember();
  if (!member) redirect("/login");

  const { noteId } = await params;
  const note = await getNote(member, noteId).catch((error) => {
    if (error instanceof NotFoundError) return null;
    throw error; // anything else is a real failure, not a 404
  });
  if (!note) notFound();

  const [members, tags, tasks, { events }] = await Promise.all([
    getMembers(member.householdId),
    getHouseholdTags(member.householdId),
    getVisibleTasks(member),
    getCalendarRange(member, subDays(new Date(), 30), addDays(new Date(), 90)),
  ]);

  return (
    <NoteDetail
      note={note}
      members={members}
      tags={tags}
      currentMemberId={member.id}
      linkableTasks={tasks.map((t) => ({ id: t.id, label: t.title }))}
      linkableEvents={events.map((e) => ({ id: e.id, label: e.title }))}
    />
  );
}
