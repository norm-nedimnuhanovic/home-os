import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvite, getInviteByToken, requestPasswordReset, updatePassword } from "./actions";
import { prisma, prismaAuthBootstrap } from "@/lib/db";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn() },
  prismaAuthBootstrap: { invite: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/access/module-grants", () => ({ seedModuleGrantsForHousehold: vi.fn() }));
vi.mock("@/modules/finance/actions/seed-starter-categories", () => ({ seedStarterCategories: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const pendingInvite = {
  id: "invite_1",
  householdId: "household_1",
  email: "newmember@example.com",
  role: "member" as const,
  status: "pending" as const,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  household: { name: "The Rivera Household" },
  invitedByMember: { displayName: "Sam" },
};

function buildFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("getInviteByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the invite when pending and not expired (happy path)", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue(pendingInvite as never);

    expect(await getInviteByToken("abc123")).toEqual(pendingInvite);
  });

  it("returns null for an expired invite", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue({
      ...pendingInvite,
      expiresAt: new Date(Date.now() - 1000),
    } as never);

    expect(await getInviteByToken("abc123")).toBeNull();
  });

  it("returns null for an already-accepted invite", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue({
      ...pendingInvite,
      status: "accepted",
    } as never);

    expect(await getInviteByToken("abc123")).toBeNull();
  });

  it("returns null when no invite matches the token", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue(null);

    expect(await getInviteByToken("nonexistent")).toBeNull();
  });
});

describe("acceptInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the Member and marks the Invite accepted, scoped by householdId (happy path)", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue(pendingInvite as never);
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: { user: { id: "auth_user_1" } }, error: null }) } },
    } as never);
    const txMemberCreate = vi.fn().mockResolvedValue({ id: "member_new" });
    const txInviteUpdate = vi.fn().mockResolvedValue({});
    const txSurfaceFindMany = vi.fn().mockResolvedValue([]);
    const txPreferenceCreateMany = vi.fn().mockResolvedValue({ count: 0 });
    vi.mocked(prisma.$transaction).mockImplementation(((fn: (tx: unknown) => unknown) =>
      fn({
        member: { create: txMemberCreate },
        invite: { update: txInviteUpdate },
        moduleSurfaceRegistration: { findMany: txSurfaceFindMany },
        notificationPreference: { createMany: txPreferenceCreateMany },
      })) as never);

    const result = await acceptInvite(
      buildFormData({ token: "abc123", displayName: "Jamie", password: "password123" }),
    );

    expect(result).toEqual({ success: true });
    expect(txMemberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: "household_1",
        supabaseUserId: "auth_user_1",
        role: "member",
        status: "active",
      }),
    });
    expect(txInviteUpdate).toHaveBeenCalledWith({
      where: { id: "invite_1", householdId: "household_1" },
      data: expect.objectContaining({ status: "accepted", acceptedByMemberId: "member_new" }),
    });
  });

  it("rejects when the invite is no longer valid (rejected path)", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue(null);

    const result = await acceptInvite(
      buildFormData({ token: "bad-token", displayName: "Jamie", password: "password123" }),
    );

    expect(result).toEqual({ error: "This invite is no longer valid. Ask an admin to resend it." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("surfaces a friendlier error when the email is already registered", async () => {
    vi.mocked(prismaAuthBootstrap.invite.findUnique).mockResolvedValue(pendingInvite as never);
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "already been registered" } }),
        },
      },
    } as never);

    const result = await acceptInvite(
      buildFormData({ token: "abc123", displayName: "Jamie", password: "password123" }),
    );

    expect(result).toEqual({
      error: "An account already exists for this email address. Multi-household accounts aren't supported yet.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always returns the same message, whether or not the email has an account (happy path)", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);

    const result = await requestPasswordReset(buildFormData({ email: "someone@example.com" }));

    expect(result).toEqual({
      success: true,
      message: "If that email has an account, a reset link is on its way.",
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "someone@example.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/reset-password/update") }),
    );
  });

  it("rejects a malformed email before ever calling Supabase (rejected path)", async () => {
    const resetPasswordForEmail = vi.fn();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);

    await expect(requestPasswordReset(buildFormData({ email: "not-an-email" }))).rejects.toThrow();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("updatePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the password and redirects to the dashboard (happy path)", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { updateUser } } as never);

    await updatePassword(buildFormData({ password: "newpassword123" }));

    expect(updateUser).toHaveBeenCalledWith({ password: "newpassword123" });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns Supabase's own error instead of redirecting when the update fails (rejected path)", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "Session expired" } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: { updateUser } } as never);

    const result = await updatePassword(buildFormData({ password: "newpassword123" }));

    expect(result).toEqual({ error: "Session expired" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
