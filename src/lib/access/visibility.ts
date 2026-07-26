import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";

export type VisibilityScope = {
  /** Module.key that owns this entity, e.g. "tasks", "finance", "life_admin" */
  moduleKey: string;
  /** ObjectShare.objectType for this entity, e.g. "Task", "Transaction" */
  objectType: string;
  /** The field on this Prisma model holding the creator/author Member id */
  ownerField: string;
};

/**
 * Builds the Prisma `where` fragment that scopes a query on a shareable
 * entity to what `actingMember` is allowed to see, per the visibility
 * contract in plan.md. Always combine with other filters via `AND`, never
 * spread both into the same object — visibility and caller filters each
 * carry their own `OR`, and a naive spread merge silently drops one of them
 * (docs/access-control.md §5.4).
 */
export async function visibilityWhere(
  actingMember: Pick<ActingMember, "id" | "householdId">,
  scope: VisibilityScope,
) {
  const shares = await prisma.objectShare.findMany({
    where: {
      householdId: actingMember.householdId,
      moduleKey: scope.moduleKey,
      objectType: scope.objectType,
      sharedWithMemberId: actingMember.id,
    },
    select: { objectId: true },
  });
  const sharedObjectIds = shares.map((s) => s.objectId);

  return {
    householdId: actingMember.householdId,
    OR: [
      { visibility: "household" as const },
      { visibility: "private" as const, [scope.ownerField]: actingMember.id },
      {
        visibility: "specific_members" as const,
        OR: [{ [scope.ownerField]: actingMember.id }, { id: { in: sharedObjectIds } }],
      },
    ],
  };
}
