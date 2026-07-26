import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotificationCategories, getDigestSubscription } from "./get-preferences";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    moduleSurfaceRegistration: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    digestSubscription: { findUnique: vi.fn() },
  },
}));

describe("getNotificationCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults every toggle to true when no preference row exists yet (missing row means on)", async () => {
    vi.mocked(prisma.moduleSurfaceRegistration.findMany).mockResolvedValue([
      { target: "task.assigned", label: "Task assigned to you", sortOrder: 10 },
    ] as never);
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);

    const result = await getNotificationCategories("household_1", "member_1");

    expect(result).toEqual([
      { categoryKey: "task.assigned", label: "Task assigned to you", emailEnabled: true, inAppEnabled: true, digestEnabled: true },
    ]);
  });

  it("uses the existing preference row's values when one exists", async () => {
    vi.mocked(prisma.moduleSurfaceRegistration.findMany).mockResolvedValue([
      { target: "task.assigned", label: "Task assigned to you", sortOrder: 10 },
    ] as never);
    vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([
      { categoryKey: "task.assigned", emailEnabled: false, inAppEnabled: true, digestEnabled: false },
    ] as never);

    const result = await getNotificationCategories("household_1", "member_1");

    expect(result[0]).toEqual({
      categoryKey: "task.assigned",
      label: "Task assigned to you",
      emailEnabled: false,
      inAppEnabled: true,
      digestEnabled: false,
    });
  });
});

describe("getDigestSubscription", () => {
  it("scopes the lookup by both memberId and householdId", async () => {
    vi.mocked(prisma.digestSubscription.findUnique).mockResolvedValue(null);

    await getDigestSubscription("household_1", "member_1");

    expect(prisma.digestSubscription.findUnique).toHaveBeenCalledWith({
      where: { memberId: "member_1", householdId: "household_1" },
    });
  });
});
