import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";
import { CONTACT_VISIBILITY_SCOPE } from "../entities/contact";

export async function getContact(actingMember: ActingMember, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      AND: [{ id: contactId }, await visibilityWhere(actingMember, CONTACT_VISIBILITY_SCOPE)],
    },
  });
  if (!contact) throw new NotFoundError("Contact not found.");
  return contact;
}
