import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBudget } from "./create-budget";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { budget: { create: vi.fn() } },
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

describe("createBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a whole-household budget scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.budget.create).mockResolvedValue({ id: "budget_1" } as never);

    await createBudget({
      categoryId: "ccategory0000000000001",
      amount: 500,
      effectiveFrom: new Date("2026-08-01"),
    });

    expect(prisma.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          memberId: null,
          amount: 500,
          alertThresholdPercent: 80,
        }),
      }),
    );
  });

  it("rejects a non-positive amount before ever calling prisma.budget.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(
      createBudget({
        categoryId: "ccategory0000000000001",
        amount: 0,
        effectiveFrom: new Date("2026-08-01"),
      }),
    ).rejects.toThrow();
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });
});
