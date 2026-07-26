import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateBudget } from "./update-budget";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { budget: { update: vi.fn() } },
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

describe("updateBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the budget scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.budget.update).mockResolvedValue({ id: "budget_1" } as never);

    await updateBudget("budget_1", {
      categoryId: "ccategory0000000000001",
      amount: 600,
      effectiveFrom: new Date("2026-08-01"),
      endDate: new Date("2026-12-31"),
    });

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "budget_1", householdId: "household_1" },
        data: expect.objectContaining({ amount: 600, endDate: new Date("2026-12-31") }),
      }),
    );
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(
      updateBudget("budget_1", {
        categoryId: "ccategory0000000000001",
        amount: 600,
        effectiveFrom: new Date("2026-08-01"),
      }),
    ).rejects.toThrow("Not authenticated");
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });
});
