import { beforeEach, describe, expect, it, vi } from "vitest";
import { toggleShoppingListItemChecked } from "./toggle-shopping-list-item-checked";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    shoppingList: { findFirst: vi.fn() },
    shoppingListItem: { update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({
  emitShoppingListItemChecked: vi.fn(),
  emitShoppingListItemUnchecked: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000002", householdId: "household_1", role: "member" as const };

describe("toggleShoppingListItemChecked", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps checkedBy/checkedAt when checking an item (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({ id: "list_1", items: [] } as never);
    vi.mocked(prisma.shoppingListItem.update).mockResolvedValue({ id: "item_1", isChecked: true } as never);

    await toggleShoppingListItemChecked("list_1", "item_1", true);

    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isChecked: true, checkedById: "cmember0000000000002" }) }),
    );
  });

  it("clears checkedBy/checkedAt when unchecking an item", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({ id: "list_1", items: [] } as never);
    vi.mocked(prisma.shoppingListItem.update).mockResolvedValue({ id: "item_1", isChecked: false } as never);

    await toggleShoppingListItemChecked("list_1", "item_1", false);

    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isChecked: false, checkedById: null, checkedAt: null } }),
    );
  });

  it("rejects when the list isn't visible to the acting member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(toggleShoppingListItemChecked("list_1", "item_1", true)).rejects.toThrow(NotFoundError);
    expect(prisma.shoppingListItem.update).not.toHaveBeenCalled();
  });
});
