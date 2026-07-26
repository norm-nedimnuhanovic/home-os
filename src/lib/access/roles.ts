import type { MemberRole } from "@prisma/client";

export const ROLE_RANK: Record<MemberRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/** True if actingRole is at least as privileged as minimumRole. */
export function hasAtLeastRole(actingRole: MemberRole, minimumRole: MemberRole): boolean {
  return ROLE_RANK[actingRole] >= ROLE_RANK[minimumRole];
}
