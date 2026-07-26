import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransaction } from "./create-transaction";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitTransactionRecorded } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { transaction: { create: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitTransactionRecorded: vi.fn() }));
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

describe("createTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a transaction with no splits (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.transaction.create).mockResolvedValue({ id: "txn_1" } as never);

    await createTransaction(base);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          amount: 100,
          splitType: "none",
          splits: { create: [] },
        }),
      }),
    );
    expect(emitTransactionRecorded).toHaveBeenCalledWith("household_1", "txn_1", "cmember0000000000001");
  });

  it("auto-settles the payer's own split when splitting equally", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.transaction.create).mockResolvedValue({ id: "txn_1" } as never);

    await createTransaction({
      ...base,
      splitType: "equal",
      splitMemberIds: ["cmember0000000000001", "cmember0000000000002"],
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          splits: {
            create: expect.arrayContaining([
              expect.objectContaining({ memberId: "cmember0000000000001", settled: true }),
              expect.objectContaining({ memberId: "cmember0000000000002", settled: false }),
            ]),
          },
        }),
      }),
    );
  });

  it("rejects a non-positive amount before ever calling prisma.transaction.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createTransaction({ ...base, amount: 0 })).rejects.toThrow();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
