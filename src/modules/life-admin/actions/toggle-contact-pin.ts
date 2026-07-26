"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/auth/session";
import { getContact } from "../queries/get-contact";

export async function toggleContactPin(contactId: string, isPinned: boolean) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  await getContact(member, contactId); // visibility check — same Q30 reasoning as updateContact

  const contact = await prisma.contact.update({
    where: { id: contactId, householdId: member.householdId },
    data: { isPinned },
  });

  revalidatePath("/life-admin/contacts");
  return contact;
}
