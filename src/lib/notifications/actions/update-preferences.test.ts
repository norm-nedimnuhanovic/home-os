import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreference, updateDigestSubscription } from "./update-preferences";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { notificationPreference: { upsert: vi.fn() }, digestSubscription: { upsert: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
  household: { timezone: "UTC" },
};

describe("updateNotificationPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts scoped by householdId, never memberId alone (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue({} as never);

    await updateNotificationPreference({
      categoryKey: "bill.due_soon",
      emailEnabled: false,
      inAppEnabled: true,
      digestEnabled: true,
    });

    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        memberId_categoryKey: { memberId: "member_1", categoryKey: "bill.due_soon" },
        householdId: "household_1",
      },
      create: {
        householdId: "household_1",
        memberId: "member_1",
        categoryKey: "bill.due_soon",
        emailEnabled: false,
        inAppEnabled: true,
        digestEnabled: true,
      },
      update: { categoryKey: "bill.due_soon", emailEnabled: false, inAppEnabled: true, digestEnabled: true },
    });
  });

  it("rejects when the caller isn't authenticated (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(
      updateNotificationPreference({
        categoryKey: "bill.due_soon",
        emailEnabled: false,
        inAppEnabled: true,
        digestEnabled: true,
      }),
    ).rejects.toThrow("Not authenticated");
    expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
  });
});

describe("updateDigestSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes nextRunAt in the household's own timezone (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.digestSubscription.upsert).mockResolvedValue({} as never);

    await updateDigestSubscription({ frequency: "daily", timeOfDay: "07:00" });

    expect(prisma.digestSubscription.upsert).toHaveBeenCalledWith({
      where: { memberId: "member_1", householdId: "household_1" },
      create: expect.objectContaining({
        householdId: "household_1",
        memberId: "member_1",
        frequency: "daily",
        dayOfWeek: null,
        timeOfDay: "07:00",
        nextRunAt: expect.any(Date),
      }),
      update: expect.objectContaining({ frequency: "daily", dayOfWeek: null, timeOfDay: "07:00" }),
    });
  });

  it("clears a stale dayOfWeek when switching away from weekly", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.digestSubscription.upsert).mockResolvedValue({} as never);

    await updateDigestSubscription({ frequency: "daily", timeOfDay: "07:00" });

    expect(prisma.digestSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ dayOfWeek: null }) }),
    );
  });

  it("rejects weekly frequency with no dayOfWeek", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(updateDigestSubscription({ frequency: "weekly", timeOfDay: "07:00" })).rejects.toThrow(
      "dayOfWeek is required when frequency is weekly",
    );
    expect(prisma.digestSubscription.upsert).not.toHaveBeenCalled();
  });

  it("rejects when the caller isn't authenticated", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(updateDigestSubscription({ frequency: "daily", timeOfDay: "07:00" })).rejects.toThrow(
      "Not authenticated",
    );
  });
});
