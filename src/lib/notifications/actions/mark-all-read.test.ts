import { beforeEach, describe, expect, it, vi } from "vitest";
import { markAllNotificationsRead } from "./mark-all-read";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { notification: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));

const seededMember = { id: "member_1", householdId: "household_1", role: "member" as const };

describe("markAllNotificationsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks only this member's still-unread notifications (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 3 } as never);

    await markAllNotificationsRead();

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", memberId: "member_1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("rejects when the caller isn't authenticated (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(markAllNotificationsRead()).rejects.toThrow("Not authenticated");
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});
