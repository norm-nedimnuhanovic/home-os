import { beforeEach, describe, expect, it, vi } from "vitest";
import { fanOutNotificationsForOccurrence } from "./dispatch";
import { prisma } from "@/lib/db";
import { getEffectivePreference } from "./entities/notification-preference";
import { sendCategoryEmail } from "@/lib/email/send-category-email";

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: { create: vi.fn() },
    task: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
  },
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
    payloadSnapshot: { taskId: "task_1", assigneeId: "member_2" },
    eventType: { key: "task.assigned", label: "Task assigned" },
    ...overrides,
  } as never;
}

describe("fanOutNotificationsForOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a specific title/body/source from the task and assigner (happy path)", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: true,
      inAppEnabled: true,
      digestEnabled: true,
    });
    vi.mocked(prisma.task.findUnique).mockResolvedValue({ title: "Water the plants" } as never);
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ displayName: "Priya" } as never);

    await fanOutNotificationsForOccurrence(seedOccurrence());

    expect(getEffectivePreference).toHaveBeenCalledWith("household_1", "member_2", "task.assigned");
    // Both AND householdId — never id alone (CLAUDE.md rule 1); Task and
    // Member are both tenant-guarded models, so a where missing householdId
    // throws at the Prisma layer and would take the whole createTask()
    // Server Action down with it, not just silently skip the lookup.
    expect(prisma.task.findUnique).toHaveBeenCalledWith({
      where: { id: "task_1", householdId: "household_1" },
      select: { title: true },
    });
    expect(prisma.member.findUnique).toHaveBeenCalledWith({
      where: { id: "member_1", householdId: "household_1" },
      select: { displayName: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        householdId: "household_1",
        memberId: "member_2",
        categoryKey: "task.assigned",
        sourceModule: "task",
        sourceEntityType: "Task",
        sourceEntityId: "task_1",
        eventOccurrenceId: "occurrence_1",
        title: "Task assigned",
        body: 'Priya assigned you "Water the plants"',
      },
    });
    expect(sendCategoryEmail).toHaveBeenCalledWith(
      { taskId: "task_1", assigneeId: "member_2", triggeredByMemberId: "member_1" },
      "member_2",
      "task.assigned",
    );
  });

  it("builds a share.received detail from the sharer and objectType", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: false,
      inAppEnabled: true,
      digestEnabled: true,
    });
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ displayName: "Sam" } as never);

    await fanOutNotificationsForOccurrence(
      seedOccurrence({
        payloadSnapshot: {
          objectType: "Note",
          objectId: "note_1",
          sharedByMemberId: "member_3",
          sharedWithMemberId: "member_2",
        },
        eventType: { key: "share.received", label: "Item shared with you" },
      }),
    );

    expect(prisma.member.findUnique).toHaveBeenCalledWith({
      where: { id: "member_3", householdId: "household_1" },
      select: { displayName: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceEntityType: "Note",
        sourceEntityId: "note_1",
        title: "Item shared with you",
        body: "Sam shared a Note with you",
      }),
    });
  });

  it("falls back to the generic label when the source task no longer resolves", async () => {
    vi.mocked(getEffectivePreference).mockResolvedValue({
      emailEnabled: false,
      inAppEnabled: true,
      digestEnabled: true,
    });
    vi.mocked(prisma.task.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.member.findUnique).mockResolvedValue(null);

    await fanOutNotificationsForOccurrence(seedOccurrence());

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "Task assigned", body: null, sourceEntityType: "Task", sourceEntityId: "task_1" }),
    });
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
    vi.mocked(prisma.task.findUnique).mockResolvedValue({ title: "Water the plants" } as never);
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ displayName: "Priya" } as never);

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
    vi.mocked(prisma.task.findUnique).mockResolvedValue({ title: "Water the plants" } as never);
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ displayName: "Priya" } as never);
    vi.mocked(sendCategoryEmail).mockRejectedValue(new Error("Resend is down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fanOutNotificationsForOccurrence(seedOccurrence())).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
