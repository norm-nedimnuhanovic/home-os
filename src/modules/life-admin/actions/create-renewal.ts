"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createRenewalInputSchema, type CreateRenewalFormInput, RENEWAL_VISIBILITY_SCOPE } from "../entities/renewal";
import { regenerateRenewalReminders } from "./regenerate-renewal-reminders";
import { emitRenewalCreated } from "../events/emitters";

export async function createRenewal(input: CreateRenewalFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createRenewalInputSchema.parse(input);

  const renewal = await prisma.renewal.create({
    data: {
      householdId: member.householdId,
      title: data.title,
      type: data.type,
      provider: data.provider ?? null,
      purchaseOrIssueDate: data.purchaseOrIssueDate ?? null,
      expiryDate: data.expiryDate,
      reminderOffsetsDays: data.reminderOffsetsDays,
      recurrence: data.recurrence,
      responsibleMemberId: data.responsibleMemberId ?? null,
      providerContactId: data.providerContactId ?? null,
      visibility: data.visibility,
      createdById: member.id,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: RENEWAL_VISIBILITY_SCOPE.moduleKey,
      objectType: RENEWAL_VISIBILITY_SCOPE.objectType,
      objectId: renewal.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  // Reminders is a required dependency (module.ts) — Renewal degrades
  // gracefully (plan.md §4.8) if this ever throws for an unrelated reason,
  // but a required, pre-granted dependency isn't expected to be missing.
  await regenerateRenewalReminders(renewal, member.id);

  await emitRenewalCreated(member.householdId, renewal.id, renewal.title, member.id);

  revalidatePath("/life-admin/renewals");
  return renewal;
}
