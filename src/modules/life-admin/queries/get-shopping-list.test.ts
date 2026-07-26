import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getShoppingList } from "./get-shopping-list";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { shoppingList: { findFirst: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getShoppingList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the list with its items when visibility permits it", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({ id: "list_1", items: [] } as never);

    const result = await getShoppingList(actingMember as never, "list_1");

    expect(result).toEqual({ id: "list_1", items: [] });
    expect(prisma.shoppingList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ items: expect.anything() }) }),
    );
  });

  it("throws NotFoundError when the list doesn't exist or isn't visible", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(getShoppingList(actingMember as never, "list_missing")).rejects.toThrow(NotFoundError);
  });
});
