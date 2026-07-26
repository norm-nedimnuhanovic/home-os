import { beforeEach, describe, expect, it, vi } from "vitest";
import { snoozeOccurrence } from "./snooze-occurrence";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getOccurrence } from "../queries/get-occurrence";
import { emitReminderSnoozed } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { reminderOccurrence: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-occurrence", () => ({ getOccurrence: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitReminderSnoozed: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("snoozeOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("snoozes the occurrence when the acting member is its reminder's target (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getOccurrence).mockResolvedValue({
      id: "occ_1",
      reminderId: "reminder_1",
      householdId: "household_1",
      reminder: { targetMemberId: "member_1" },
    } as never);
    vi.mocked(prisma.reminderOccurrence.update).mockResolvedValue({ id: "occ_1" } as never);

    const snoozedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await snoozeOccurrence("occ_1", snoozedUntil);

    expect(prisma.reminderOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ_1", householdId: "household_1" },
      data: {
        status: "snoozed",
        snoozedUntil,
        snoozeCount: { increment: 1 },
        acknowledgedAt: expect.any(Date),
      },
    });
    expect(emitReminderSnoozed).toHaveBeenCalledWith("household_1", "reminder_1", "occ_1", "member_1");
  });

  it("rejects a snooze time in the past", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(snoozeOccurrence("occ_1", new Date(Date.now() - 1000))).rejects.toThrow(
      "Snooze time must be in the future.",
    );
    expect(prisma.reminderOccurrence.update).not.toHaveBeenCalled();
  });

  it("rejects when the acting member isn't this reminder's target (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getOccurrence).mockResolvedValue({
      id: "occ_1",
      reminderId: "reminder_1",
      householdId: "household_1",
      reminder: { targetMemberId: "cmember0000000000002" },
    } as never);

    await expect(snoozeOccurrence("occ_1", new Date(Date.now() + 60 * 60 * 1000))).rejects.toThrow(
      "Only this reminder's target can snooze it.",
    );
    expect(prisma.reminderOccurrence.update).not.toHaveBeenCalled();
  });
});
