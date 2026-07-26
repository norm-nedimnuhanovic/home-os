import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getMemberBalances } from "./get-member-balances";

vi.mock("@/lib/db", () => ({
  prisma: {
    transactionSplit: { findMany: vi.fn() },
    settlement: { findMany: vi.fn() },
  },
}));

describe("getMemberBalances", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes a net balance from an unsettled split — the split's member owes the payer", async () => {
    vi.mocked(prisma.transactionSplit.findMany).mockResolvedValue([
      { memberId: "member_2", shareAmount: 30, transaction: { paidById: "member_1" } },
    ] as never);
    vi.mocked(prisma.settlement.findMany).mockResolvedValue([]);

    const result = await getMemberBalances("household_1");

    expect(result).toHaveLength(1);
    const [a, b] = ["member_1", "member_2"].sort();
    expect(result[0].memberAId).toBe(a);
    expect(result[0].memberBId).toBe(b);
    // member_2 owes member_1 — sign is positive iff member_2 sorts first.
    expect(result[0].netAmount).toBe(a === "member_2" ? 30 : -30);
  });

  it("nets out a free-standing settlement against outstanding splits between the same pair", async () => {
    vi.mocked(prisma.transactionSplit.findMany).mockResolvedValue([
      { memberId: "member_2", shareAmount: 30, transaction: { paidById: "member_1" } },
    ] as never);
    vi.mocked(prisma.settlement.findMany).mockResolvedValue([
      { fromMemberId: "member_2", toMemberId: "member_1", amount: 30 },
    ] as never);

    const result = await getMemberBalances("household_1");

    expect(result).toHaveLength(0); // fully settled, filtered out at netAmount === 0
  });

  it("excludes a member's own split from their own balance (payer paying themself)", async () => {
    vi.mocked(prisma.transactionSplit.findMany).mockResolvedValue([
      { memberId: "member_1", shareAmount: 30, transaction: { paidById: "member_1" } },
    ] as never);
    vi.mocked(prisma.settlement.findMany).mockResolvedValue([]);

    const result = await getMemberBalances("household_1");

    expect(result).toHaveLength(0);
  });

  it("only queries free-standing settlements (appliesTo empty) — linked ones are already reflected via settled splits", async () => {
    vi.mocked(prisma.transactionSplit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.settlement.findMany).mockResolvedValue([]);

    await getMemberBalances("household_1");

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ appliesTo: { none: {} } }),
      }),
    );
  });
});
