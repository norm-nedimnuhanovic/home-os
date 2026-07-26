import { beforeEach, describe, expect, it, vi } from "vitest";
import { fanOutNotificationsForOccurrence } from "./dispatch";
import { prisma } from "@/lib/db";
import { getEffectivePreference } from "./entities/notification-preference";
import { sendCategoryEmail } from "@/lib/email/send-category-email";

vi.mock("@/lib/db", () => ({
  prisma: { notification: { create: vi.fn() } },
}));
vi.mock("./entities/notification-preference", () => ({
  getEffectivePreference: vi.fn(),
}));
vi.mock("@/lib/email/send-category-email", () => ({ sendCategoryEmail: vi.fn() }));

function seedOccurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: "occurrence_1",
    householdId: "household_1",
    triggeredByMemberId: "member_1",
    payloadSnapshot: { assigneeId: "member_2" },
    eventType: { key: "task.assigned", label: "Task assigned" },
    ...overrides,
  } as never;
}

describe("fanOutNotificationsForOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Notification for a Notification-backed category when inAppEnabled (happy path)", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: true,
      inAppEnabled: true,
      digestEnabled: true,
    });

    await fanOutNotificationsForOccurrence(seedOccurrence());

    expect(getEffectivePreference).toHaveBeenCalledWith("household_1", "member_2", "task.assigned");
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        householdId: "household_1",
        memberId: "member_2",
        categoryKey: "task.assigned",
        sourceModule: "task",
        eventOccurrenceId: "occurrence_1",
        title: "Task assigned",
      },
    });
    expect(sendCategoryEmail).toHaveBeenCalledWith(
      { assigneeId: "member_2", triggeredByMemberId: "member_1" },
      "member_2",
      "task.assigned",
    );
  });

  it("skips creating a Notification when inAppEnabled is false (rejected/gated path)", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: false,
      inAppEnabled: false,
      digestEnabled: true,
    });

    await fanOutNotificationsForOccurrence(seedOccurrence());

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(sendCategoryEmail).not.toHaveBeenCalled();
  });

  it("skips sending email when emailEnabled is false, even if inAppEnabled is true", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: false,
      inAppEnabled: true,
      digestEnabled: true,
    });

    await fanOutNotificationsForOccurrence(seedOccurrence());

    expect(prisma.notification.create).toHaveBeenCalled();
    expect(sendCategoryEmail).not.toHaveBeenCalled();
  });

  it("does nothing for a category with no registered recipient resolver", async () => {
    await fanOutNotificationsForOccurrence(
      seedOccurrence({ eventType: { key: "task.completed", label: "Task completed" } }),
    );

    expect(getEffectivePreference).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(sendCategoryEmail).not.toHaveBeenCalled();
  });

  it("never lets a failed email send propagate — a Resend outage must not break the triggering action", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: true,
      inAppEnabled: true,
      digestEnabled: true,
    });
    vi.mocked(sendCategoryEmail).mockRejectedValue(new Error("Resend is down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fanOutNotificationsForOccurrence(seedOccurrence())).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
