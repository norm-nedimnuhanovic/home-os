import type { ResourceDomain, AccessLevel } from "@prisma/client";
import { prisma } from "@/lib/db";

// The tenant-guard extension (src/lib/db/tenant-guard.ts) makes `prisma`'s
// own type incompatible with Prisma's plain `Prisma.TransactionClient` —
// derive `Db` from the extended client's own `$transaction` callback
// parameter instead of the generic Prisma type, so it always matches
// whatever `tx` actually is at every real call site.
type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Run once, inside the same transaction that creates the Household
 * (docs/access-control.md §7.1). Built-in modules' required declarations
 * are pre-granted automatically — "all 8 apps work immediately with zero
 * setup." Everything else (optional declarations of built-in modules, and
 * every declaration of a custom module) starts in pending_review.
 */
export async function seedModuleGrantsForHousehold(db: Db, householdId: string) {
  const declarations = await db.modulePermissionDeclaration.findMany({
    include: { module: true },
  });

  await db.moduleGrant.createMany({
    data: declarations.map((decl) => ({
      householdId,
      moduleId: decl.moduleId,
      permissionDeclarationId: decl.id,
      status: decl.isRequired && decl.module.kind === "built_in" ? "granted" : "pending_review",
      grantedAt: decl.isRequired && decl.module.kind === "built_in" ? new Date() : null,
    })),
  });
}

export async function hasModuleGrant(
  householdId: string,
  moduleKey: string,
  resourceDomain: ResourceDomain,
  accessLevel: AccessLevel = "read",
): Promise<boolean> {
  const grant = await prisma.moduleGrant.findFirst({
    where: {
      householdId,
      status: "granted",
      module: { key: moduleKey },
      permissionDeclaration: { resourceDomain, accessLevel },
    },
  });
  return grant !== null;
}
