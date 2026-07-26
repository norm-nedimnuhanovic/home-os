import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSettlement } from "./create-settlement";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitSettlementRecorded } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: {
    member: { findFirst: vi.fn() },
    transactionSplit: { findMany: vi.fn(), updateMany: vi.fn() },
    settlement: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitSettlementRecorded: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "cmember0000000000001",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("createSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a free-standing settlement (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.member.findFirst)
      .mockResolvedValueOnce({ id: "cmember0000000000002" } as never)
      .mockResolvedValueOnce({ id: "cmember0000000000003" } as never);
    vi.mocked(prisma.settlement.create).mockResolvedValue({ id: "settlement_1" } as never);

    await createSettlement({
      fromMemberId: "cmember0000000000002",
      toMemberId: "cmember0000000000003",
      amount: 50,
    });

    expect(prisma.settlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          fromMemberId: "cmember0000000000002",
          toMemberId: "cmember0000000000003",
          amount: 50,
        }),
      }),
    );
    expect(prisma.transactionSplit.updateMany).not.toHaveBeenCalled();
    expect(emitSettlementRecorded).toHaveBeenCalledWith("household_1", "settlement_1", "cmember0000000000001");
  });

  it("settles only the referenced splits that actually match the from→to direction", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.member.findFirst)
      .mockResolvedValueOnce({ id: "cmember0000000000002" } as never)
      .mockResolvedValueOnce({ id: "cmember0000000000003" } as never);
    vi.mocked(prisma.transactionSplit.findMany).mockResolvedValue([
      { id: "csplit00000000000001" },
    ] as never);
    vi.mocked(prisma.settlement.create).mockResolvedValue({ id: "settlement_1" } as never);

    await createSettlement({
      fromMemberId: "cmember0000000000002",
      toMemberId: "cmember0000000000003",
      amount: 50,
      appliesToSplitIds: ["csplit00000000000001"],
    });

    expect(prisma.transactionSplit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: "cmember0000000000002",
          settled: false,
          transaction: { paidById: "cmember0000000000003" },
        }),
      }),
    );
    expect(prisma.transactionSplit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { settled: true, settledById: "settlement_1" },
      }),
    );
  });

  it("rejects when the two members are the same (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(
      createSettlement({
        fromMemberId: "cmember0000000000002",
        toMemberId: "cmember0000000000002",
        amount: 50,
      }),
    ).rejects.toThrow();
    expect(prisma.settlement.create).not.toHaveBeenCalled();
  });
});
