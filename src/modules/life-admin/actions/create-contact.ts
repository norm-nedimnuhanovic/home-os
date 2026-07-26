"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { syncObjectShares } from "@/lib/household/actions/sync-object-shares";
import { createContactInputSchema, type CreateContactFormInput, CONTACT_VISIBILITY_SCOPE } from "../entities/contact";
import { emitContactCreated } from "../events/emitters";

// No ownership check beyond "is an active member of this household" —
// plan.md §9 Q30 makes visibility the entire check for Contact, and create
// has no prior row to check ownership against anyway.
export async function createContact(input: CreateContactFormInput) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  const data = createContactInputSchema.parse(input);

  const contact = await prisma.contact.create({
    data: {
      householdId: member.householdId,
      name: data.name,
      category: data.category,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      website: data.website ?? null,
      notes: data.notes ?? null,
      isPinned: data.isPinned,
      visibility: data.visibility,
      createdById: member.id,
    },
  });

  if (data.visibility === "specific_members") {
    await syncObjectShares({
      householdId: member.householdId,
      moduleKey: CONTACT_VISIBILITY_SCOPE.moduleKey,
      objectType: CONTACT_VISIBILITY_SCOPE.objectType,
      objectId: contact.id,
      sharedByMemberId: member.id,
      sharedWithMemberIds: data.sharedWithMemberIds ?? [],
    });
  }

  await emitContactCreated(member.householdId, contact.id, contact.name, member.id);

  revalidatePath("/life-admin/contacts");
  return contact;
}
