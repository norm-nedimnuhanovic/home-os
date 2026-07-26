import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelReminder } from "./cancel-reminder";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getReminder } from "../queries/get-reminder";
import { emitReminderCancelled } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: {
    reminder: { update: vi.fn() },
    reminderOccurrence: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-reminder", () => ({ getReminder: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitReminderCancelled: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("cancelReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels the reminder and dismisses its active occurrences (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getReminder).mockResolvedValue({
      id: "reminder_1",
      householdId: "household_1",
      createdByMemberId: "member_1",
      targetMemberId: "member_1",
    } as never);
    vi.mocked(prisma.reminder.update).mockResolvedValue({ id: "reminder_1" } as never);

    await cancelReminder("reminder_1");

    expect(prisma.reminder.update).toHaveBeenCalledWith({
      where: { id: "reminder_1", householdId: "household_1" },
      data: { status: "cancelled" },
    });
    expect(prisma.reminderOccurrence.updateMany).toHaveBeenCalledWith({
      where: {
        householdId: "household_1",
        reminderId: "reminder_1",
        status: { in: ["pending", "notified", "snoozed"] },
      },
      data: { status: "dismissed" },
    });
    expect(emitReminderCancelled).toHaveBeenCalledWith("household_1", "reminder_1", "member_1");
  });

  it("rejects when the acting member neither created nor is the target of the reminder (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getReminder).mockResolvedValue({
      id: "reminder_1",
      householdId: "household_1",
      createdByMemberId: "cmember0000000000002",
      targetMemberId: "cmember0000000000003",
    } as never);

    await expect(cancelReminder("reminder_1")).rejects.toThrow(
      "You can only cancel reminders you created or are the target of.",
    );
    expect(prisma.reminder.update).not.toHaveBeenCalled();
  });
});
