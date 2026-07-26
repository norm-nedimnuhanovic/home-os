import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTransaction } from "./update-transaction";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getTransaction } from "../queries/get-transaction";

vi.mock("@/lib/db", () => ({
  prisma: { transaction: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-transaction", () => ({ getTransaction: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "cmember0000000000001",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

const base = {
  amount: 100,
  categoryId: "ccategory0000000000001",
  title: "Groceries",
  date: new Date("2026-08-01"),
  paidById: "cmember0000000000001",
};

describe("updateTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the transaction when the acting member paid it and no split is settled (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTransaction).mockResolvedValue({
      id: "txn_1",
      householdId: "household_1",
      paidById: "cmember0000000000001",
      splits: [],
    } as never);
    vi.mocked(prisma.transaction.update).mockResolvedValue({ id: "txn_1" } as never);

    await updateTransaction("txn_1", base);

    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "txn_1", householdId: "household_1" },
        data: expect.objectContaining({ title: "Groceries" }),
      }),
    );
  });

  it("rejects when the acting member didn't pay for the transaction (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTransaction).mockResolvedValue({
      id: "txn_1",
      householdId: "household_1",
      paidById: "cmember0000000000002",
      splits: [],
    } as never);

    await expect(updateTransaction("txn_1", base)).rejects.toThrow(
      "Only the member who paid can edit this transaction.",
    );
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it("rejects when any split has already been settled (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTransaction).mockResolvedValue({
      id: "txn_1",
      householdId: "household_1",
      paidById: "cmember0000000000001",
      splits: [{ settled: true }],
    } as never);

    await expect(updateTransaction("txn_1", base)).rejects.toThrow(
      "This transaction has settled splits — undo the settlement before editing it.",
    );
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
