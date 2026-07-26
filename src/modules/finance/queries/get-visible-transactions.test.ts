import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleTransactions } from "./get-visible-transactions";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getVisibleTransactions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by visibility and defaults to posted status", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([{ id: "txn_1" }] as never);

    const result = await getVisibleTransactions(actingMember as never);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [expect.objectContaining({ householdId: "household_1" }), { status: "posted" }],
        },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("filters by categoryId and date range when provided", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);

    const from = new Date("2026-08-01");
    const to = new Date("2026-08-31");
    await getVisibleTransactions(actingMember as never, { categoryId: "cat_1", from, to });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.any(Object),
            { status: "posted", categoryId: "cat_1", date: { gte: from, lte: to } },
          ],
        },
      }),
    );
  });
});
