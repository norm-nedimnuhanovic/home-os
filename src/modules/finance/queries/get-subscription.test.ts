import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getSubscription } from "./get-subscription";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { findFirst: vi.fn() } },
}));

describe("getSubscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue({ id: "sub_1" } as never);

    const result = await getSubscription("household_1", "sub_1");

    expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
      where: { id: "sub_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "sub_1" });
  });

  it("throws NotFoundError instead of returning null when the subscription isn't in this household", async () => {
    vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);

    await expect(getSubscription("household_1", "sub_missing")).rejects.toThrow(NotFoundError);
  });
});
