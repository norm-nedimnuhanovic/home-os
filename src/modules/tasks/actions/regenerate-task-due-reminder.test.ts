import { beforeEach, describe, expect, it, vi } from "vitest";
import { regenerateTaskDueReminder, cancelTaskDueReminder } from "./regenerate-task-due-reminder";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";

vi.mock("@/lib/db", () => ({
  prisma: {
    reminder: { findMany: vi.fn(), updateMany: vi.fn() },
    reminderOccurrence: { updateMany: vi.fn() },
  },
}));
vi.mock("@/modules/reminders", () => ({ createReminder: vi.fn() }));

function seedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task_1",
    householdId: "household_1",
    title: "Take bins to the curb",
    dueDate: new Date("2026-08-01T00:00:00.000Z"),
    assigneeId: "member_2",
    createdById: "member_1",
    ...overrides,
  };
}

describe("cancelTaskDueReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels the reminder and dismisses its live occurrences", async () => {
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([{ id: "reminder_1" }] as never);

    await cancelTaskDueReminder(seedTask() as never);

    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", id: { in: ["reminder_1"] } },
      data: { status: "cancelled" },
    });
    expect(prisma.reminderOccurrence.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", reminderId: { in: ["reminder_1"] }, status: { in: ["pending", "notified", "snoozed"] } },
      data: { status: "dismissed" },
    });
  });

  it("no-ops when there's no existing reminder", async () => {
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);

    await cancelTaskDueReminder(seedTask() as never);

    expect(prisma.reminder.updateMany).not.toHaveBeenCalled();
  });
});

describe("regenerateTaskDueReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
  });

  it("creates a reminder targeting the assignee, firstRemindAt = dueDate - leadTime (happy path)", async () => {
    await regenerateTaskDueReminder(seedTask() as never, true, 2, "days", "member_1");

    expect(createReminder).toHaveBeenCalledWith({
      householdId: "household_1",
      title: "Take bins to the curb is due soon",
      targetMemberId: "member_2",
      createdByMemberId: "member_1",
      sourceType: "task",
      sourceModule: "tasks",
      sourceEntityId: "task_1",
      reminderType: "one_off",
      firstRemindAt: new Date("2026-07-30T00:00:00.000Z"),
      leadTimeValue: 2,
      leadTimeUnit: "days",
    });
  });

  it("falls back to the acting member when the task has no assignee", async () => {
    await regenerateTaskDueReminder(seedTask({ assigneeId: null }) as never, true, 1, "days", "member_1");

    expect(createReminder).toHaveBeenCalledWith(expect.objectContaining({ targetMemberId: "member_1" }));
  });

  it("cancels any existing reminder first, every time, regardless of the new state", async () => {
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([{ id: "reminder_old" }] as never);

    await regenerateTaskDueReminder(seedTask() as never, true, 1, "days", "member_1");

    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", id: { in: ["reminder_old"] } },
      data: { status: "cancelled" },
    });
  });

  it("does not create a reminder when remindBeforeDue is false", async () => {
    await regenerateTaskDueReminder(seedTask() as never, false, 1, "days", "member_1");

    expect(createReminder).not.toHaveBeenCalled();
  });

  it("does not create a reminder when the task has no due date", async () => {
    await regenerateTaskDueReminder(seedTask({ dueDate: null }) as never, true, 1, "days", "member_1");

    expect(createReminder).not.toHaveBeenCalled();
  });
});
