import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateShoppingListItem } from "./update-shopping-list-item";
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000002", householdId: "household_1", role: "member" as const };

describe("updateShoppingListItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the item's fields (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({ id: "list_1", items: [] } as never);
    vi.mocked(prisma.shoppingListItem.update).mockResolvedValue({ id: "item_1", name: "Oat milk" } as never);

    await updateShoppingListItem("list_1", "item_1", { name: "Oat milk", quantity: "2" });

    expect(prisma.shoppingListItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Oat milk", quantity: "2" }) }),
    );
  });

  it("rejects when the list isn't visible to the acting member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(updateShoppingListItem("list_1", "item_1", { name: "Oat milk" })).rejects.toThrow(NotFoundError);
    expect(prisma.shoppingListItem.update).not.toHaveBeenCalled();
  });
});
