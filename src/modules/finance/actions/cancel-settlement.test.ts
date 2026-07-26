import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelSettlement } from "./cancel-settlement";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    settlement: { findFirst: vi.fn(), update: vi.fn() },
    transactionSplit: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "cmember0000000000001",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("cancelSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels the settlement and reverts its cleared splits when a party cancels it (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.settlement.findFirst).mockResolvedValue({
      id: "settlement_1",
      householdId: "household_1",
      fromMemberId: "cmember0000000000001",
      toMemberId: "cmember0000000000002",
    } as never);
    vi.mocked(prisma.settlement.update).mockReturnValue("update-settlement-promise" as never);
    vi.mocked(prisma.transactionSplit.updateMany).mockReturnValue("update-splits-promise" as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: "settlement_1", status: "cancelled" }]);

    await cancelSettlement("settlement_1");

    expect(prisma.settlement.update).toHaveBeenCalledWith({
      where: { id: "settlement_1", householdId: "household_1" },
      data: { status: "cancelled" },
    });
    expect(prisma.transactionSplit.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", settledById: "settlement_1" },
      data: { settled: false, settledById: null },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      "update-settlement-promise",
      "update-splits-promise",
    ]);
  });

  it("rejects when the acting member isn't a party to the settlement (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.settlement.findFirst).mockResolvedValue({
      id: "settlement_1",
      householdId: "household_1",
      fromMemberId: "cmember0000000000002",
      toMemberId: "cmember0000000000003",
    } as never);

    await expect(cancelSettlement("settlement_1")).rejects.toThrow(
      "Only a party to this settlement can cancel it.",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
