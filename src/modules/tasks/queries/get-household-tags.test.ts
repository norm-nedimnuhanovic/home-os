import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getHouseholdTags } from "./get-household-tags";

vi.mock("@/lib/db", () => ({
  prisma: { tag: { findMany: vi.fn() } },
}));

describe("getHouseholdTags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes tags by householdId — Tag has no visibility column, so this is the whole scope", async () => {
    vi.mocked(prisma.tag.findMany).mockResolvedValue([{ id: "tag_1" }] as never);

    const result = await getHouseholdTags("household_1");

    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: { householdId: "household_1" },
      orderBy: { name: "asc" },
    });
    expect(result).toHaveLength(1);
  });
});
