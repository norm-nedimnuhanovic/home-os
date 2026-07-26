import { describe, expect, it, vi } from "vitest";
import { seedNotificationPreferencesForMember } from "./seed-preferences";

describe("seedNotificationPreferencesForMember", () => {
  it("seeds one true/true/true row per registered email_notification_category, scoped by householdId", async () => {
    const db = {
      moduleSurfaceRegistration: {
        findMany: vi.fn().mockResolvedValue([{ target: "task.assigned" }, { target: "bill.due_soon" }]),
      },
      notificationPreference: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };

    await seedNotificationPreferencesForMember(db as never, "member_1", "household_1");

    expect(db.moduleSurfaceRegistration.findMany).toHaveBeenCalledWith({
      where: { surface: "email_notification_category" },
      select: { target: true },
    });
    expect(db.notificationPreference.createMany).toHaveBeenCalledWith({
      data: [
        {
          householdId: "household_1",
          memberId: "member_1",
          categoryKey: "task.assigned",
          emailEnabled: true,
          inAppEnabled: true,
          digestEnabled: true,
        },
        {
          householdId: "household_1",
          memberId: "member_1",
          categoryKey: "bill.due_soon",
          emailEnabled: true,
          inAppEnabled: true,
          digestEnabled: true,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("is a no-op createMany call when no categories are registered yet", async () => {
    const db = {
      moduleSurfaceRegistration: { findMany: vi.fn().mockResolvedValue([]) },
      notificationPreference: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };

    await seedNotificationPreferencesForMember(db as never, "member_1", "household_1");

    expect(db.notificationPreference.createMany).toHaveBeenCalledWith({ data: [], skipDuplicates: true });
  });
});
