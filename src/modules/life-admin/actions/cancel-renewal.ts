"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { getRenewal } from "../queries/get-renewal";
import { cancelRenewalReminders } from "./regenerate-renewal-reminders";
import { emitRenewalCancelled } from "../events/emitters";

export async function cancelRenewal(renewalId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const existing = await getRenewal(member, renewalId);

  if (existing.createdById !== member.id && existing.responsibleMemberId !== member.id) {
    throw new ForbiddenError("You can only cancel renewals you created or are responsible for.");
  }

  const renewal = await prisma.renewal.update({
    where: { id: renewalId, householdId: member.householdId },
    data: { status: "cancelled" },
  });

  await cancelRenewalReminders(renewal);

  await emitRenewalCancelled(member.householdId, renewal.id, member.id);

  revalidatePath("/life-admin/renewals");
  return renewal;
}
