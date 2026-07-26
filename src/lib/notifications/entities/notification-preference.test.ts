import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectivePreference, resolveReminderCategoryKey } from "./notification-preference";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { notificationPreference: { findUnique: vi.fn() } },
}));

describe("resolveReminderCategoryKey", () => {
  it("maps each ReminderSourceType to its documented categoryKey (docs/email.md §2.2)", () => {
    expect(resolveReminderCategoryKey("subscription")).toBe("bill.due_soon");
    expect(resolveReminderCategoryKey("budget")).toBe("budget.threshold_exceeded");
    expect(resolveReminderCategoryKey("renewal")).toBe("renewal.expiring_soon");
    expect(resolveReminderCategoryKey("task")).toBe("task.due_soon");
    expect(resolveReminderCategoryKey("manual")).toBe("reminder.due");
    expect(resolveReminderCategoryKey("document")).toBe("reminder.due");
    expect(resolveReminderCategoryKey("other")).toBe("reminder.due");
  });
});

describe("getEffectivePreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the lookup by householdId, memberId, and categoryKey together (happy path)", async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      emailEnabled: false,
      inAppEnabled: true,
      digestEnabled: false,
    } as never);

    const result = await getEffectivePreference("household_1", "member_1", "bill.due_soon");

    expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
      where: {
        memberId_categoryKey: { memberId: "member_1", categoryKey: "bill.due_soon" },
        householdId: "household_1",
      },
    });
    expect(result).toEqual({ emailEnabled: false, inAppEnabled: true, digestEnabled: false });
  });

  it("defaults every channel to enabled when no row exists (missing row means 'on')", async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);

    const result = await getEffectivePreference("household_1", "member_1", "reminder.due");

    expect(result).toEqual({ emailEnabled: true, inAppEnabled: true, digestEnabled: true });
  });
});
