import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import type { ActingMember } from "@/lib/auth/session";
import { CONTACT_VISIBILITY_SCOPE } from "../entities/contact";
import type { ContactCategory } from "@prisma/client";

export async function getVisibleContacts(
  actingMember: ActingMember,
  filters: { category?: ContactCategory; pinnedOnly?: boolean } = {},
) {
  return prisma.contact.findMany({
    where: {
      AND: [
        await visibilityWhere(actingMember, CONTACT_VISIBILITY_SCOPE),
        filters.category ? { category: filters.category } : {},
        filters.pinnedOnly ? { isPinned: true } : {},
      ],
    },
    orderBy: [{ isPinned: "desc" }, { name: "asc" }],
  });
}
