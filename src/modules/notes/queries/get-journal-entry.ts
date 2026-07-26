import { prisma } from "@/lib/db";

// Journal entries are private to their author (plan.md §4.6) — no
// visibility scoping needed beyond "this member wrote it," matching the
// unique constraint on (authorMemberId, entryDate).
export async function getJournalEntry(householdId: string, authorMemberId: string, entryDate: Date) {
  return prisma.note.findFirst({
    where: { householdId, authorMemberId, noteType: "journal", entryDate },
  });
}
