import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCategory } from "./create-category";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { category: { create: vi.fn() } },
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

describe("createCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a category scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.category.create).mockResolvedValue({ id: "cat_1" } as never);

    await createCategory({ name: "Groceries" });

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ householdId: "household_1", name: "Groceries", type: "expense" }),
      }),
    );
  });

  it("rejects an empty name before ever calling prisma.category.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createCategory({ name: "" })).rejects.toThrow();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});
