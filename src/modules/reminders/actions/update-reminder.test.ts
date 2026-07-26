import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateReminder } from "./update-reminder";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getReminder } from "../queries/get-reminder";

vi.mock("@/lib/db", () => ({
  prisma: {
    member: { findFirst: vi.fn() },
    reminder: { update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-reminder", () => ({ getReminder: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

const validInput = {
  title: "Pay rent (updated)",
  targetMemberId: "cmember0000000000001",
  firstRemindAt: new Date("2026-08-01"),
};

describe("updateReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the reminder when the acting member created it (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getReminder).mockResolvedValue({
      id: "reminder_1",
      householdId: "household_1",
      createdByMemberId: "member_1",
      targetMemberId: "member_1",
    } as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_1" } as never);
    vi.mocked(prisma.reminder.update).mockResolvedValue({ id: "reminder_1" } as never);

    await updateReminder("reminder_1", validInput);

    expect(prisma.reminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reminder_1", householdId: "household_1" },
        data: expect.objectContaining({ title: "Pay rent (updated)" }),
      }),
    );
  });

  it("allows the reminder's target (not just its creator) to edit it", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getReminder).mockResolvedValue({
      id: "reminder_1",
      householdId: "household_1",
      createdByMemberId: "cmember0000000000002",
      targetMemberId: "member_1",
    } as never);
    vi.mocked(prisma.member.findFirst).mockResolvedValue({ id: "member_1" } as never);
    vi.mocked(prisma.reminder.update).mockResolvedValue({ id: "reminder_1" } as never);

    await expect(updateReminder("reminder_1", validInput)).resolves.toBeDefined();
  });

  it("rejects when the acting member neither created nor is the target of the reminder (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getReminder).mockResolvedValue({
      id: "reminder_1",
      householdId: "household_1",
      createdByMemberId: "cmember0000000000002",
      targetMemberId: "cmember0000000000003",
    } as never);

    await expect(updateReminder("reminder_1", validInput)).rejects.toThrow(
      "You can only edit reminders you created or are the target of.",
    );
    expect(prisma.reminder.update).not.toHaveBeenCalled();
  });
});
