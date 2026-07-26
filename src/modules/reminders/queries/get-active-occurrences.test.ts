import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getActiveReminderOccurrences } from "./get-active-occurrences";

vi.mock("@/lib/db", () => ({
  prisma: { reminderOccurrence: { findMany: vi.fn() } },
}));

describe("getActiveReminderOccurrences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId, the target member, and the non-terminal statuses", async () => {
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValue([{ id: "occ_1" }] as never);

    const result = await getActiveReminderOccurrences("household_1", "member_1");

    expect(prisma.reminderOccurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId: "household_1",
          status: { in: ["pending", "notified", "snoozed"] },
          reminder: { targetMemberId: "member_1" },
        },
      }),
    );
    expect(result).toHaveLength(1);
  });
});
