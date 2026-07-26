import type { MemberRole } from "@prisma/client";
import { hasAtLeastRole } from "./roles";
import { prisma } from "@/lib/db";
import type { ActingMember } from "@/lib/auth/session";
import { ForbiddenError } from "./errors";

export function canInviteMember(actingMember: ActingMember): boolean {
  return hasAtLeastRole(actingMember.role, "admin");
}

export function canRemoveMember(
  actingMember: ActingMember,
  targetMember: { role: MemberRole },
): boolean {
  if (actingMember.role === "owner") return true;
  if (actingMember.role === "admin") return targetMember.role === "member";
  return false;
}

export function canChangeMemberRole(
  actingMember: ActingMember,
  targetMember: { role: MemberRole },
  nextRole: MemberRole,
): boolean {
  if (actingMember.role === "owner") return true;
  if (actingMember.role === "admin") {
    // admins may only promote a plain member — never touch an existing
    // admin's or owner's role, mirroring the removal rule above
    return targetMember.role === "member" && nextRole === "admin";
  }
  return false;
}

export function canModerateSharing(actingMember: ActingMember): boolean {
  return hasAtLeastRole(actingMember.role, "admin");
}

export function canCloseHousehold(actingMember: ActingMember): boolean {
  return actingMember.role === "owner";
}

export function canTransferOwnership(actingMember: ActingMember): boolean {
  return actingMember.role === "owner";
}

// Asymmetric like canRemoveMember/canChangeMemberRole, but keyed off the
// *declaration's* isRequired flag rather than the target's role: revoking a
// required declaration risks breaking a built-in module outright, so that's
// owner-only; an optional declaration (including every declaration of a
// custom module, which never auto-grants) only needs admin+ (docs/access-control.md §7.3).
export function canManageModuleGrant(
  actingMember: ActingMember,
  declaration: { isRequired: boolean },
): boolean {
  if (declaration.isRequired) return actingMember.role === "owner";
  return hasAtLeastRole(actingMember.role, "admin");
}

/**
 * Enforces "household always has ≥1 owner". Call before removing a member
 * or changing a member's role away from "owner". Pass the id of the member
 * being removed/demoted so they're excluded from the remaining count.
 */
export async function assertNotLastOwner(householdId: string, excludingMemberId: string) {
  const remainingOwners = await prisma.member.count({
    where: {
      householdId,
      role: "owner",
      status: "active",
      id: { not: excludingMemberId },
    },
  });
  if (remainingOwners === 0) {
    throw new ForbiddenError("A household must always have at least one owner.");
  }
}
