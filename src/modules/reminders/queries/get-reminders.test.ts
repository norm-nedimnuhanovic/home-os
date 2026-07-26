import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleReminders } from "./get-reminders";

vi.mock("@/lib/db", () => ({
  prisma: { reminder: { findMany: vi.fn() } },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getVisibleReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and by created-by-me OR targeted-at-me — never a household-wide read", async () => {
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([{ id: "reminder_1" }] as never);

    const result = await getVisibleReminders(actingMember);

    expect(prisma.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId: "household_1",
          OR: [{ createdByMemberId: "member_1" }, { targetMemberId: "member_1" }],
        },
      }),
    );
    expect(result).toHaveLength(1);
  });
});
