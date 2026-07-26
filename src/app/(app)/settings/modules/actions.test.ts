import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewModuleGrant } from "./actions";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    modulePermissionDeclaration: { findUniqueOrThrow: vi.fn() },
    moduleGrant: { update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingOwner = { id: "member_1", householdId: "household_1", role: "owner" as const };
const actingAdmin = { id: "member_2", householdId: "household_1", role: "admin" as const };
const actingMember = { id: "member_3", householdId: "household_1", role: "member" as const };

const optionalDeclaration = {
  id: "decl_1",
  moduleId: "module_1",
  resourceDomain: "tasks" as const,
  accessLevel: "write" as const,
  isRequired: false,
};
const requiredDeclaration = { ...optionalDeclaration, id: "decl_2", isRequired: true };

describe("reviewModuleGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets an admin approve a pending, optional declaration (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.modulePermissionDeclaration.findUniqueOrThrow).mockResolvedValue(optionalDeclaration as never);
    vi.mocked(prisma.moduleGrant.update).mockResolvedValue({ id: "grant_1", status: "granted" } as never);

    const result = await reviewModuleGrant("decl_1", "granted");

    expect(result).toEqual({ success: true, data: { id: "grant_1", status: "granted" } });
    expect(prisma.moduleGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId_moduleId_permissionDeclarationId: {
            householdId: "household_1",
            moduleId: "module_1",
            permissionDeclarationId: "decl_1",
          },
          householdId: "household_1",
        },
        data: expect.objectContaining({ status: "granted", grantedById: "member_2" }),
      }),
    );
  });

  it("rejects a plain member from reviewing any declaration (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.modulePermissionDeclaration.findUniqueOrThrow).mockResolvedValue(optionalDeclaration as never);

    const result = await reviewModuleGrant("decl_1", "granted");

    expect(result).toEqual({ success: false, error: "Only an admin or owner can review module permissions." });
    expect(prisma.moduleGrant.update).not.toHaveBeenCalled();
  });

  it("rejects an admin revoking a required declaration — owner-only", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.modulePermissionDeclaration.findUniqueOrThrow).mockResolvedValue(requiredDeclaration as never);

    const result = await reviewModuleGrant("decl_2", "revoked");

    expect(result).toEqual({
      success: false,
      error: "Only the owner can change a permission a built-in module requires to function.",
    });
    expect(prisma.moduleGrant.update).not.toHaveBeenCalled();
  });

  it("lets the owner revoke a required declaration", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingOwner as never);
    vi.mocked(prisma.modulePermissionDeclaration.findUniqueOrThrow).mockResolvedValue(requiredDeclaration as never);
    vi.mocked(prisma.moduleGrant.update).mockResolvedValue({ id: "grant_2", status: "revoked" } as never);

    const result = await reviewModuleGrant("decl_2", "revoked");

    expect(result).toEqual({ success: true, data: { id: "grant_2", status: "revoked" } });
    expect(prisma.moduleGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "revoked", revokedById: "member_1" }) }),
    );
  });
});
