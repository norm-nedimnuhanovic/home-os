import { beforeEach, describe, expect, it, vi } from "vitest";
import { inviteMember, resendInvite, removeMember, changeMemberRole, transferOwnership, closeHousehold } from "./actions";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { sendHouseholdInviteEmail } from "@/lib/email/send-category-email";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/db", () => ({
  prisma: {
    member: { findFirst: vi.fn(), update: vi.fn() },
    invite: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    household: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/email/send-category-email", () => ({ sendHouseholdInviteEmail: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingOwner = {
  id: "member_1",
  householdId: "household_1",
  role: "owner" as const,
  status: "active" as const,
  displayName: "Sam",
  household: { name: "The Rivera Household" },
};
const actingAdmin = { ...actingOwner, id: "member_2", role: "admin" as const, displayName: "Priya" };
const actingMember = { ...actingOwner, id: "member_3", role: "member" as const, displayName: "Jordan" };

describe("inviteMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates the Invite and sends the invite email directly, bypassing NotificationPreference (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.invite.create).mockResolvedValue({
      email: "newmember@example.com",
      token: "abc123",
    } as never);

    const result = await inviteMember({ email: "newmember@example.com", role: "member" });

    expect(result).toEqual({
      success: true,
      data: { email: "newmember@example.com", token: "abc123" },
    });
    expect(sendHouseholdInviteEmail).toHaveBeenCalledWith({
      to: "newmember@example.com",
      householdName: "The Rivera Household",
      invitedByName: "Priya",
      acceptUrl: expect.stringContaining("/invite/abc123"),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/members");
  });

  it("rejects a member role from inviting (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);

    const result = await inviteMember({ email: "newmember@example.com", role: "member" });

    expect(result).toEqual({ success: false, error: "Only an admin or owner can invite a new member." });
    expect(prisma.invite.create).not.toHaveBeenCalled();
    expect(sendHouseholdInviteEmail).not.toHaveBeenCalled();
  });

  it("rejects inviting an email that already belongs to an active member", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_9" } as never);

    const result = await inviteMember({ email: "existing@example.com", role: "member" });

    expect(result).toEqual({
      success: false,
      error: "That email already belongs to an active member of this household.",
    });
    expect(prisma.invite.create).not.toHaveBeenCalled();
    expect(sendHouseholdInviteEmail).not.toHaveBeenCalled();
  });

  it("rolls back the Invite row and surfaces a clear error when the email fails to send", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.invite.create).mockResolvedValue({
      id: "invite_1",
      householdId: "household_1",
      email: "newmember@example.com",
      token: "abc123",
    } as never);
    vi.mocked(sendHouseholdInviteEmail).mockRejectedValue(new Error("Resend is down"));

    const result = await inviteMember({ email: "newmember@example.com", role: "member" });

    expect(result).toEqual({
      success: false,
      error: "Could not send the invite email (Resend is down). Please try again.",
    });
    expect(prisma.invite.delete).toHaveBeenCalledWith({ where: { id: "invite_1", householdId: "household_1" } });
  });
});

describe("resendInvite", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const pendingInvite = {
    id: "invite_1",
    householdId: "household_1",
    email: "invitee@example.com",
    status: "pending" as const,
    token: "old-token",
  };

  it("regenerates the token and expiresAt only after the email actually sends (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.invite.findFirst).mockResolvedValue(pendingInvite as never);
    vi.mocked(prisma.invite.update).mockResolvedValue({ ...pendingInvite, token: "new-token" } as never);

    const result = await resendInvite("invite_1");

    expect(result).toEqual({ success: true, data: { ...pendingInvite, token: "new-token" } });
    expect(sendHouseholdInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "invitee@example.com", acceptUrl: expect.not.stringContaining("old-token") }),
    );
    expect(prisma.invite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite_1", householdId: "household_1" },
        data: expect.objectContaining({ token: expect.any(String), expiresAt: expect.any(Date) }),
      }),
    );
  });

  it("rejects a plain member from resending (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);

    const result = await resendInvite("invite_1");

    expect(result).toEqual({ success: false, error: "Only an admin or owner can resend an invite." });
    expect(prisma.invite.update).not.toHaveBeenCalled();
  });

  it("rejects resending an already-accepted invite", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.invite.findFirst).mockResolvedValue({ ...pendingInvite, status: "accepted" } as never);

    const result = await resendInvite("invite_1");

    expect(result).toEqual({ success: false, error: "Only a pending invite can be resent." });
    expect(sendHouseholdInviteEmail).not.toHaveBeenCalled();
    expect(prisma.invite.update).not.toHaveBeenCalled();
  });

  it("does not persist a new token when the email fails to send", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.invite.findFirst).mockResolvedValue(pendingInvite as never);
    vi.mocked(sendHouseholdInviteEmail).mockRejectedValue(new Error("Resend is down"));

    const result = await resendInvite("invite_1");

    expect(result).toEqual({
      success: false,
      error: "Could not send the invite email (Resend is down). Please try again.",
    });
    expect(prisma.invite.update).not.toHaveBeenCalled();
  });
});

describe("removeMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("flips status to removed and bans the Supabase user, scoped by householdId (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingOwner as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_9", role: "member" } as never);
    vi.mocked(prisma.member.update).mockResolvedValue({ id: "member_9", supabaseUserId: "supabase_9" } as never);
    const updateUserById = vi.fn();
    vi.mocked(createAdminSupabaseClient).mockReturnValue({ auth: { admin: { updateUserById } } } as never);

    const result = await removeMember("member_9");

    expect(result).toEqual({ success: true, data: { id: "member_9", supabaseUserId: "supabase_9" } });
    // Real bug found and fixed alongside the resend-invite/close-household
    // work: this update previously omitted householdId entirely, which the
    // tenant guard (src/lib/db/tenant-guard.ts) rejects outright.
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "member_9", householdId: "household_1" },
      data: { status: "removed" },
    });
    expect(updateUserById).toHaveBeenCalledWith("supabase_9", { ban_duration: "876000h" });
    // Real bug found via an actual browser test: without this, the
    // already-open /settings/members page kept showing the removed member
    // until a manual reload.
    expect(revalidatePath).toHaveBeenCalledWith("/settings/members");
  });

  it("rejects an admin removing another admin (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_9", role: "admin" } as never);

    const result = await removeMember("member_9");

    expect(result).toEqual({ success: false, error: "Only the owner can remove an admin." });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});

describe("changeMemberRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("promotes a member to admin, scoped by householdId (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingOwner as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_9", role: "member" } as never);
    vi.mocked(prisma.member.update).mockResolvedValue({ id: "member_9", role: "admin" } as never);

    const result = await changeMemberRole("member_9", "admin");

    expect(result).toEqual({ success: true, data: { id: "member_9", role: "admin" } });
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "member_9", householdId: "household_1" },
      data: { role: "admin" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/members");
  });

  it("rejects an admin demoting another admin (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_9", role: "admin" } as never);

    const result = await changeMemberRole("member_9", "member");

    expect(result).toEqual({ success: false, error: "You are not allowed to change this member's role." });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});

describe("transferOwnership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("promotes the target and demotes the acting owner in one transaction, both scoped by householdId (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingOwner as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_9", status: "active" } as never);
    vi.mocked(prisma.member.update).mockReturnValue("update-promise" as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: "member_9", role: "owner" }, { id: "member_1", role: "admin" }]);

    const result = await transferOwnership("member_9");

    expect(result).toEqual({ success: true, data: [{ id: "member_9", role: "owner" }, { id: "member_1", role: "admin" }] });
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "member_9", householdId: "household_1" },
      data: { role: "owner" },
    });
    expect(prisma.member.update).toHaveBeenCalledWith({
      where: { id: "member_1", householdId: "household_1" },
      data: { role: "admin" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(["update-promise", "update-promise"]);
    expect(revalidatePath).toHaveBeenCalledWith("/settings/members");
  });

  it("rejects a non-owner from transferring ownership (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);

    const result = await transferOwnership("member_9");

    expect(result).toEqual({ success: false, error: "Only the current owner can transfer ownership." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("closeHousehold", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("closes the household and revokes every pending invite in one transaction (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingOwner as never);
    vi.mocked(prisma.household.update).mockReturnValue("close-household-promise" as never);
    vi.mocked(prisma.invite.updateMany).mockReturnValue("revoke-invites-promise" as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ status: "closed" }, { count: 2 }]);

    const result = await closeHousehold();

    expect(result).toEqual({ success: true, data: undefined });
    expect(prisma.household.update).toHaveBeenCalledWith({
      where: { id: "household_1" },
      data: { status: "closed" },
    });
    expect(prisma.invite.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", status: "pending" },
      data: { status: "revoked" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(["close-household-promise", "revoke-invites-promise"]);
  });

  it("rejects a non-owner from closing the household (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingAdmin as never);

    const result = await closeHousehold();

    expect(result).toEqual({ success: false, error: "Only the owner can close the household." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
