"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createRenewalInputSchema, type CreateRenewalFormInput, RENEWAL_VISIBILITY_SCOPE } from "../entities/renewal";
import { getRenewal } from "../queries/get-renewal";
import { regenerateRenewalReminders } from "./regenerate-renewal-reminders";

// Harness extrapolation, Task-shaped (docs/access-control.md §4.3): plan.md
// doesn't give Renewal its own Q30-style "anyone with visibility can edit"
// carve-out the way it does for Contact/ShoppingList, so this follows the
// general "manage your own data + assigned items" default instead —
// creator, or the member responsible for it.
export async function updateRenewal(renewalId: string, input: CreateRenewalFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getRenewal(member, renewalId); // tenant + visibility check

  if (existing.createdById !== member.id && existing.responsibleMemberId !== member.id) {
    throw new ForbiddenError("You can only edit renewals you created or are responsible for.");
  }

  const data = createRenewalInputSchema.parse(input);

  const renewal = await prisma.renewal.update({
    where: { id: renewalId, householdId: member.householdId },
    data: {
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
    },
  });

  await syncObjectShares({
    householdId: member.householdId,
    moduleKey: RENEWAL_VISIBILITY_SCOPE.moduleKey,
    objectType: RENEWAL_VISIBILITY_SCOPE.objectType,
    objectId: renewal.id,
    sharedByMemberId: member.id,
    sharedWithMemberIds: data.visibility === "specific_members" ? data.sharedWithMemberIds ?? [] : [],
  });

  // Only regenerate when the fields that actually drive reminder timing
  // changed — editing the provider name or notes shouldn't churn reminders
  // (plan.md §4.8 only calls out expiryDate/reminderOffsetsDays).
  const expiryChanged = existing.expiryDate.getTime() !== renewal.expiryDate.getTime();
  const offsetsChanged =
    JSON.stringify(existing.reminderOffsetsDays) !== JSON.stringify(renewal.reminderOffsetsDays);
  const responsibleChanged = existing.responsibleMemberId !== renewal.responsibleMemberId;
  if (expiryChanged || offsetsChanged || responsibleChanged) {
    await regenerateRenewalReminders(renewal, member.id);
  }

  // No renewal.updated event — plan.md §4.8's Emits: line for Life Admin
  // doesn't list one; don't register an event type it doesn't ask for.
  revalidatePath("/life-admin/renewals");
  return renewal;
}
