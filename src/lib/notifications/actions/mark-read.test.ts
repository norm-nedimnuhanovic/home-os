import { beforeEach, describe, expect, it, vi } from "vitest";
import { markNotificationRead } from "./mark-read";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { notification: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));

const seededMember = { id: "member_1", householdId: "household_1", role: "member" as const };

describe("markNotificationRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the update to the recipient member, not just the household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 } as never);

    await markNotificationRead("notif_1");

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notif_1", householdId: "household_1", memberId: "member_1" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("rejects when the caller isn't authenticated (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(markNotificationRead("notif_1")).rejects.toThrow("Not authenticated");
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("silently updates 0 rows for another member's notification, never leaks whether it exists (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 } as never);

    const result = await markNotificationRead("someone_elses_notif");

    expect(result).toEqual({ count: 0 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "someone_elses_notif", householdId: "household_1", memberId: "member_1" },
      data: { readAt: expect.any(Date) },
    });
  });
});
