import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSubscription } from "./update-subscription";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { update: vi.fn() } },
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

const base = {
  name: "Netflix",
  categoryId: "ccategory0000000000001",
  amount: 18,
  startDate: new Date("2026-08-01"),
  responsibleMemberId: "cmember0000000000001",
};

describe("updateSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the subscription scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.subscription.update).mockResolvedValue({ id: "sub_1" } as never);

    await updateSubscription("sub_1", base);

    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_1", householdId: "household_1" },
        data: expect.objectContaining({ amount: 18 }),
      }),
    );
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(updateSubscription("sub_1", base)).rejects.toThrow("Not authenticated");
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
