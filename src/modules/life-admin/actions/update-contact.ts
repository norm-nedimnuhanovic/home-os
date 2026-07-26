"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createContactInputSchema, type CreateContactFormInput, CONTACT_VISIBILITY_SCOPE } from "../entities/contact";
import { getContact } from "../queries/get-contact";
import { emitContactUpdated } from "../events/emitters";

// plan.md §9 Q30: anyone with visibility into a Contact can edit it — being
// able to load it at all via getContact() (visibility-checked) IS the
// authorization check. Resist adding an isOwner check the way Task/Renewal
// do — that's a different, stricter rule that doesn't apply to Contact.
export async function updateContact(contactId: string, input: CreateContactFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getContact(member, contactId);

  const data = createContactInputSchema.parse(input);

  const contact = await prisma.contact.update({
    where: { id: contactId, householdId: member.householdId },
    data: {
      name: data.name,
      category: data.category,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      website: data.website ?? null,
      notes: data.notes ?? null,
      isPinned: data.isPinned,
      visibility: data.visibility,
    },
  });

  await syncObjectShares({
    householdId: member.householdId,
    moduleKey: CONTACT_VISIBILITY_SCOPE.moduleKey,
    objectType: CONTACT_VISIBILITY_SCOPE.objectType,
    objectId: contact.id,
    sharedByMemberId: member.id,
    sharedWithMemberIds: data.visibility === "specific_members" ? data.sharedWithMemberIds ?? [] : [],
  });

  await emitContactUpdated(member.householdId, contact.id, member.id);

  revalidatePath("/life-admin/contacts");
  return contact;
}
