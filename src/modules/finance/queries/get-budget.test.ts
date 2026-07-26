import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBudget } from "./get-budget";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { budget: { findFirst: vi.fn() } },
}));

describe("getBudget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.budget.findFirst).mockResolvedValue({ id: "budget_1" } as never);

    const result = await getBudget("household_1", "budget_1");

    expect(prisma.budget.findFirst).toHaveBeenCalledWith({
      where: { id: "budget_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "budget_1" });
  });

  it("throws NotFoundError instead of returning null when the budget isn't in this household", async () => {
    vi.mocked(prisma.budget.findFirst).mockResolvedValue(null);

    await expect(getBudget("household_1", "budget_missing")).rejects.toThrow(NotFoundError);
  });
});
