import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateCategory } from "./update-category";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { category: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("updateCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the category scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.category.update).mockResolvedValue({ id: "cat_1" } as never);

    await updateCategory("cat_1", { name: "Renamed" });

    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat_1", householdId: "household_1" },
        data: expect.objectContaining({ name: "Renamed" }),
      }),
    );
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(updateCategory("cat_1", { name: "Renamed" })).rejects.toThrow("Not authenticated");
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});
