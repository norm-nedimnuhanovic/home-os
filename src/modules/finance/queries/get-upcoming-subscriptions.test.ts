import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getUpcomingSubscriptions } from "./get-upcoming-subscriptions";

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { findMany: vi.fn() } },
}));

describe("getUpcomingSubscriptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId, active status, and the lookahead window with no lower bound", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([{ id: "sub_1" }] as never);
    const asOf = new Date("2026-07-24T00:00:00.000Z");

    const result = await getUpcomingSubscriptions("household_1", 7, asOf);

    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId: "household_1",
          status: "active",
          nextDueDate: { lte: new Date("2026-07-31T00:00:00.000Z") },
        },
      }),
    );
    expect(result).toHaveLength(1);
  });
});
