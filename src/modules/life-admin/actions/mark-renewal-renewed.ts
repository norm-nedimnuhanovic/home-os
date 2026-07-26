"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { markRenewedInputSchema, type MarkRenewedFormInput } from "../entities/renewal";
import { getRenewal } from "../queries/get-renewal";
import { cancelRenewalReminders, regenerateRenewalReminders } from "./regenerate-renewal-reminders";
import { emitRenewalRenewed } from "../events/emitters";

// plan.md §9 Q29: always prompt for the new expiry date, never auto-advance
// by the recurrence interval unconditionally.
export async function markRenewalRenewed(renewalId: string, input: MarkRenewedFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getRenewal(member, renewalId);

  if (existing.createdById !== member.id && existing.responsibleMemberId !== member.id) {
    throw new ForbiddenError("You can only mark renewals you created or are responsible for as renewed.");
  }

  const data = markRenewedInputSchema.parse(input);

  // A one-time renewal (recurrence: none) is done once handled; a recurring
  // one goes back to tracking its next cycle (RenewalHistory — a per-cycle
  // log — is explicitly out of scope for V2, so this is an in-place update,
  // not a new row).
  const renewal = await prisma.renewal.update({
    where: { id: renewalId, householdId: member.householdId },
    data: {
      expiryDate: data.newExpiryDate,
      lastRenewedAt: new Date(),
      status: existing.recurrence === "none" ? "renewed" : "active",
    },
  });

  if (renewal.status === "active") {
    // Old reminders pointed at the previous expiryDate — regenerate covers
    // both cancelling those and creating fresh ones for the new date.
    await regenerateRenewalReminders(renewal, member.id);
  } else {
    // recurrence: none — this cycle is fully done, no future reminders.
    await cancelRenewalReminders(renewal);
  }

  await emitRenewalRenewed(member.householdId, renewal.id, member.id);

  revalidatePath("/life-admin/renewals");
  return renewal;
}
