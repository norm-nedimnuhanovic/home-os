import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeShoppingListItem } from "./remove-shopping-list-item";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    shoppingList: { findFirst: vi.fn() },
    shoppingListItem: { delete: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000002", householdId: "household_1", role: "member" as const };

describe("removeShoppingListItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the item directly, no confirmation needed (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({ id: "list_1", items: [] } as never);
    vi.mocked(prisma.shoppingListItem.delete).mockResolvedValue({ id: "item_1" } as never);

    await removeShoppingListItem("list_1", "item_1");

    expect(prisma.shoppingListItem.delete).toHaveBeenCalledWith({
      where: { id: "item_1", householdId: "household_1", listId: "list_1" },
    });
  });

  it("rejects when the list isn't visible to the acting member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(removeShoppingListItem("list_1", "item_1")).rejects.toThrow(NotFoundError);
    expect(prisma.shoppingListItem.delete).not.toHaveBeenCalled();
  });
});
