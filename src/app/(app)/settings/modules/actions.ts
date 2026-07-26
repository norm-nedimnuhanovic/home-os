"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { canManageModuleGrant } from "@/lib/access/household-permissions";
import { ForbiddenError, runAction } from "@/lib/access/errors";
import { prisma } from "@/lib/db";

// The one end-user-facing part of the extensibility system (docs/access-control.md
// §7.3): a ModuleGrant always already exists for every (household, module,
// declaration) triple by the time this is called — seedModuleGrantsForHousehold()
// creates one for every ModulePermissionDeclaration at household creation, and
// again whenever a module registers a new declaration — so this only ever
// transitions status, never creates a row.
export async function reviewModuleGrant(permissionDeclarationId: string, decision: "granted" | "revoked") {
  return runAction(async () => {
    const actingMember = await requireMember();
    if (!actingMember) throw new ForbiddenError("Not authenticated.");

    // Not tenant-scoped — platform catalog data, same tier as Module itself
    // (docs/orm-conventions.md §2.1) — no householdId to filter by here.
    const declaration = await prisma.modulePermissionDeclaration.findUniqueOrThrow({
      where: { id: permissionDeclarationId },
    });

    if (!canManageModuleGrant(actingMember, declaration)) {
      throw new ForbiddenError(
        declaration.isRequired
          ? "Only the owner can change a permission a built-in module requires to function."
          : "Only an admin or owner can review module permissions.",
      );
    }

    // ModuleGrant IS tenant-scoped, so the compound unique key alone won't
    // satisfy the guard (its top-level `where` key is the compound key's
    // name, not a literal "householdId") — pair it with an explicit
    // householdId, same idiom as updateNotificationPreference() (docs/orm-conventions.md §3).
    const grant = await prisma.moduleGrant.update({
      where: {
        householdId_moduleId_permissionDeclarationId: {
          householdId: actingMember.householdId,
          moduleId: declaration.moduleId,
          permissionDeclarationId: declaration.id,
        },
        householdId: actingMember.householdId,
      },
      data:
        decision === "granted"
          ? { status: "granted", grantedById: actingMember.id, grantedAt: new Date(), revokedById: null, revokedAt: null }
          : { status: "revoked", revokedById: actingMember.id, revokedAt: new Date() },
    });

    revalidatePath("/settings/modules");
    return grant;
  });
}
