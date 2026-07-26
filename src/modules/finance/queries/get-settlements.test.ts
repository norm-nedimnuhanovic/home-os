import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getSettlements } from "./get-settlements";

vi.mock("@/lib/db", () => ({
  prisma: { settlement: { findMany: vi.fn() } },
}));

describe("getSettlements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes settlements by householdId — Settlement has no visibility column", async () => {
    vi.mocked(prisma.settlement.findMany).mockResolvedValue([{ id: "settlement_1" }] as never);

    const result = await getSettlements("household_1");

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household_1" } }),
    );
    expect(result).toHaveLength(1);
  });
});
