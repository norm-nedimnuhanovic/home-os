import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getReminder } from "./get-reminder";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { reminder: { findFirst: vi.fn() } },
}));

describe("getReminder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue({ id: "reminder_1" } as never);

    const result = await getReminder("household_1", "reminder_1");

    expect(prisma.reminder.findFirst).toHaveBeenCalledWith({
      where: { id: "reminder_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "reminder_1" });
  });

  it("throws NotFoundError instead of returning null when the reminder isn't in this household", async () => {
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null);

    await expect(getReminder("household_1", "reminder_missing")).rejects.toThrow(NotFoundError);
  });
});
