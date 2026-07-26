import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getSubscriptions } from "./get-subscriptions";

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { findMany: vi.fn() } },
}));

describe("getSubscriptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes subscriptions by householdId — Subscription has no visibility column", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([{ id: "sub_1" }] as never);

    const result = await getSubscriptions("household_1");

    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household_1" } }),
    );
    expect(result).toHaveLength(1);
  });

  it("filters by status when provided", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([]);

    await getSubscriptions("household_1", { status: "active" });

    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household_1", status: "active" } }),
    );
  });
});
