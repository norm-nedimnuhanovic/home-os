import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendDueDigests } from "./send-digests";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/resend-client";

vi.mock("@/lib/db", () => ({
  prisma: {
    household: { findMany: vi.fn() },
    digestSubscription: { findMany: vi.fn(), updateMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    reminderOccurrence: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/email/resend-client", () => ({ sendTransactionalEmail: vi.fn() }));

const now = new Date("2026-07-24T07:00:00.000Z");

function seedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    householdId: "household_1",
    memberId: "member_1",
    frequency: "daily",
    timeOfDay: "07:00",
    nextRunAt: now,
    member: { email: "sam@seed.local", household: { timezone: "UTC" } },
    ...overrides,
  };
}

describe("sendDueDigests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "household_1" }] as never);
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([]);
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValue([]);
  });

  it("sends a digest and advances nextRunAt when there's unread content (happy path)", async () => {
    vi.mocked(prisma.digestSubscription.findMany).mockResolvedValue([seedSubscription()] as never);
    vi.mocked(prisma.digestSubscription.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { id: "notif_1", categoryKey: "task.assigned", title: "You were assigned a task" },
    ] as never);

    const result = await sendDueDigests(now);

    expect(prisma.digestSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: "sub_1", householdId: "household_1", nextRunAt: now },
      data: { nextRunAt: expect.any(Date), lastSentAt: now },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sam@seed.local" }),
    );
    expect(result).toEqual({ checked: 1, sent: 1 });
  });

  it("skips a member already claimed by an overlapping invocation", async () => {
    vi.mocked(prisma.digestSubscription.findMany).mockResolvedValue([seedSubscription()] as never);
    vi.mocked(prisma.digestSubscription.updateMany).mockResolvedValue({ count: 0 });

    const result = await sendDueDigests(now);

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, sent: 0 });
  });

  it("advances nextRunAt but sends nothing when there's no unread content", async () => {
    vi.mocked(prisma.digestSubscription.findMany).mockResolvedValue([seedSubscription()] as never);
    vi.mocked(prisma.digestSubscription.updateMany).mockResolvedValue({ count: 1 });

    const result = await sendDueDigests(now);

    expect(prisma.digestSubscription.updateMany).toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, sent: 0 });
  });

  it("excludes a category the member has digestEnabled: false for", async () => {
    vi.mocked(prisma.digestSubscription.findMany).mockResolvedValue([seedSubscription()] as never);
    vi.mocked(prisma.digestSubscription.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { categoryKey: "task.assigned", digestEnabled: false },
    ] as never);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { id: "notif_1", categoryKey: "task.assigned", title: "You were assigned a task" },
    ] as never);

    const result = await sendDueDigests(now);

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, sent: 0 });
  });

  it("keeps processing remaining members when one member's send fails", async () => {
    vi.mocked(prisma.digestSubscription.findMany).mockResolvedValue([
      seedSubscription(),
      seedSubscription({ id: "sub_2", memberId: "member_2", member: { email: "jamie@seed.local", household: { timezone: "UTC" } } }),
    ] as never);
    vi.mocked(prisma.digestSubscription.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { id: "notif_1", categoryKey: "task.assigned", title: "You were assigned a task" },
    ] as never);
    vi.mocked(sendTransactionalEmail)
      .mockRejectedValueOnce(new Error("Resend is down"))
      .mockResolvedValueOnce(undefined as never);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendDueDigests(now);

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    expect(result).toEqual({ checked: 2, sent: 1 });
    consoleError.mockRestore();
  });
});
