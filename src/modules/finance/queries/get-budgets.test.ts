import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBudgets } from "./get-budgets";

vi.mock("@/lib/db", () => ({
  prisma: { budget: { findMany: vi.fn() } },
}));

describe("getBudgets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes budgets by householdId — Budget has no visibility column", async () => {
    vi.mocked(prisma.budget.findMany).mockResolvedValue([{ id: "budget_1" }] as never);

    const result = await getBudgets("household_1");

    expect(prisma.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household_1" } }),
    );
    expect(result).toHaveLength(1);
  });
});
