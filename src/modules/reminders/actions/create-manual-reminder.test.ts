import { beforeEach, describe, expect, it, vi } from "vitest";
import { createManualReminder } from "./create-manual-reminder";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createReminder } from "./create-reminder";

vi.mock("@/lib/db", () => ({
  prisma: { member: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("./create-reminder", () => ({ createReminder: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("createManualReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the session and delegates to createReminder with sourceType=manual (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "cmember0000000000002" } as never);
    vi.mocked(createReminder).mockResolvedValue({ id: "reminder_1" } as never);

    await createManualReminder({
      title: "Pay rent",
      targetMemberId: "cmember0000000000002",
      firstRemindAt: new Date("2026-08-01"),
    });

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: "household_1",
        createdByMemberId: "member_1",
        sourceType: "manual",
        targetMemberId: "cmember0000000000002",
      }),
    );
  });

  it("rejects when the target member isn't in this household (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue(null);

    await expect(
      createManualReminder({
        title: "Pay rent",
        targetMemberId: "cmember0000000000099",
        firstRemindAt: new Date("2026-08-01"),
      }),
    ).rejects.toThrow("Target member not found in this household.");
    expect(createReminder).not.toHaveBeenCalled();
  });
});
