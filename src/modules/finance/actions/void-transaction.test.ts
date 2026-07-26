import { beforeEach, describe, expect, it, vi } from "vitest";
import { voidTransaction } from "./void-transaction";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getTransaction } from "../queries/get-transaction";

vi.mock("@/lib/db", () => ({
  prisma: { transaction: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-transaction", () => ({ getTransaction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "cmember0000000000001",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("voidTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("voids the transaction when the acting member paid it and no split is settled (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTransaction).mockResolvedValue({
      id: "txn_1",
      householdId: "household_1",
      paidById: "cmember0000000000001",
      splits: [],
    } as never);
    vi.mocked(prisma.transaction.update).mockResolvedValue({ id: "txn_1" } as never);

    await voidTransaction("txn_1");

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn_1", householdId: "household_1" },
      data: { status: "void" },
    });
  });

  it("rejects when any split has already been settled (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTransaction).mockResolvedValue({
      id: "txn_1",
      householdId: "household_1",
      paidById: "cmember0000000000001",
      splits: [{ settled: true }],
    } as never);

    await expect(voidTransaction("txn_1")).rejects.toThrow(
      "This transaction has settled splits — undo the settlement before voiding it.",
    );
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
