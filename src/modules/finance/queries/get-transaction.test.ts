import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getTransaction } from "./get-transaction";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { transaction: { findFirst: vi.fn() } },
}));

describe("getTransaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: "txn_1" } as never);

    const result = await getTransaction("household_1", "txn_1");

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "txn_1", householdId: "household_1" } }),
    );
    expect(result).toEqual({ id: "txn_1" });
  });

  it("throws NotFoundError instead of returning null when the transaction isn't in this household", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null);

    await expect(getTransaction("household_1", "txn_missing")).rejects.toThrow(NotFoundError);
  });
});
