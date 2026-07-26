"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { upsertJournalEntryInputSchema, type UpsertJournalEntryInput } from "../entities/journal";

// "Opening today's entry upserts rather than duplicates" (plan.md §3.3) —
// the unique constraint on (authorMemberId, entryDate) is what makes this
// safe as a genuine upsert, not a race-prone find-then-create.
export async function upsertJournalEntry(input: UpsertJournalEntryInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = upsertJournalEntryInputSchema.parse(input);

  const note = await prisma.note.upsert({
    where: {
      one_journal_entry_per_member_per_day: { authorMemberId: member.id, entryDate: data.entryDate },
      householdId: member.householdId, // both, always — the tenant guard requires it explicitly
    },
    update: { body: data.body },
    create: {
      householdId: member.householdId,
      authorMemberId: member.id,
      body: data.body,
      noteType: "journal",
      entryDate: data.entryDate,
      visibility: "private", // always private — not user-choosable (plan.md §4.6)
    },
  });

  revalidatePath("/notes");
  return note;
}
