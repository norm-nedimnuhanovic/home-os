import { prisma } from "@/lib/db";
import { visibilityWhere } from "@/lib/access/visibility";
import { NotFoundError } from "@/lib/access/errors";
import type { ActingMember } from "@/lib/auth/session";
import { RENEWAL_VISIBILITY_SCOPE } from "../entities/renewal";

export async function getRenewal(actingMember: ActingMember, renewalId: string) {
  const renewal = await prisma.renewal.findFirst({
    where: {
      AND: [{ id: renewalId }, await visibilityWhere(actingMember, RENEWAL_VISIBILITY_SCOPE)],
    },
    include: { responsibleMember: { select: { displayName: true } }, providerContact: { select: { name: true } } },
  });
  if (!renewal) throw new NotFoundError("Renewal not found.");
  return renewal;
}
