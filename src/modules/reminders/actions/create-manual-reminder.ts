"use server";

import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { createManualReminderInputSchema, type CreateManualReminderFormInput } from "../entities/reminder";
import { createReminder } from "./create-reminder";

// The client-facing entry point for the "New reminder" dialog — resolves
// and validates the session, then calls the shared createReminder()
// capability with sourceType always "manual" and householdId/
// createdByMemberId taken from the session, never from client input.
export async function createManualReminder(input: CreateManualReminderFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createManualReminderInputSchema.parse(input);

  // Re-scope: targetMemberId must actually belong to this household — never
  // trust a client-supplied id alone (CLAUDE.md rule 1).
  const target = await prisma.member.findFirst({
    where: { id: data.targetMemberId, householdId: member.householdId },
  });
  if (!target) throw new Error("Target member not found in this household.");

  return createReminder({
    ...data,
    householdId: member.householdId,
    createdByMemberId: member.id,
    sourceType: "manual",
  });
}
