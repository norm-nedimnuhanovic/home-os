import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCategories } from "./get-categories";

vi.mock("@/lib/db", () => ({
  prisma: { category: { findMany: vi.fn() } },
}));

describe("getCategories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and excludes archived categories by default", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([{ id: "cat_1" }] as never);

    const result = await getCategories("household_1");

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: "household_1", archived: false } }),
    );
    expect(result).toHaveLength(1);
  });
});
