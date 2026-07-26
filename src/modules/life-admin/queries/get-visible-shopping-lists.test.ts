import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleShoppingLists } from "./get-visible-shopping-lists";

vi.mock("@/lib/db", () => ({
  prisma: { shoppingList: { findMany: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getVisibleShoppingLists", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and defaults to non-archived lists", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.shoppingList.findMany).mockResolvedValue([{ id: "list_1" }] as never);

    const result = await getVisibleShoppingLists(actingMember as never);

    expect(prisma.shoppingList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ isArchived: false })]),
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });
});
