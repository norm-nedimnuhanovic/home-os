"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/access/errors";
import { hasAtLeastRole } from "@/lib/access/roles";
import { getContact } from "../queries/get-contact";

// Not a plan.md rule — §9 Q30 resolves *editing* only, not deletion. This is
// a harness extrapolation, the same one docs/resources.md's own Contact
// worked example uses: delete is more destructive than edit, so it requires
// creator-or-admin/owner rather than "anyone with visibility."
export async function deleteContact(contactId: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const contact = await getContact(member, contactId); // tenant + visibility check

  if (contact.createdById !== member.id && !hasAtLeastRole(member.role, "admin")) {
    throw new ForbiddenError("Only the creator or a household admin/owner can delete this contact.");
  }

  // Document.linkedEntityId is a generic, untyped pointer (docs/orm-
  // conventions.md §4) — Prisma can't cascade it. Renewal.providerContactId
  // is a real, typed relation with an implicit onDelete: SetNull default
  // (Prisma's default for an optional relation scalar), so it needs no
  // manual cleanup here.
  await prisma.document.updateMany({
    where: { householdId: member.householdId, linkedEntityType: "contact", linkedEntityId: contactId },
    data: { linkedEntityType: null, linkedEntityId: null },
  });

  await prisma.objectShare.deleteMany({
    where: { householdId: member.householdId, moduleKey: "life_admin", objectType: "Contact", objectId: contactId },
  });

  await prisma.contact.delete({ where: { id: contactId, householdId: member.householdId } });

  revalidatePath("/life-admin/contacts");
}
