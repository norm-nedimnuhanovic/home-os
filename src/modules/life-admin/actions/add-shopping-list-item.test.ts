import { beforeEach, describe, expect, it, vi } from "vitest";
import { addShoppingListItem } from "./add-shopping-list-item";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    shoppingList: { findFirst: vi.fn() },
    shoppingListItem: { create: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitShoppingListItemAdded: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000002", householdId: "household_1", role: "member" as const };

describe("addShoppingListItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("appends the item at the end of the list's existing items (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({
      id: "list_1",
      items: [{ sortOrder: 1 }, { sortOrder: 2 }],
    } as never);
    vi.mocked(prisma.shoppingListItem.create).mockResolvedValue({ id: "item_1", name: "Milk" } as never);

    await addShoppingListItem("list_1", { name: "Milk" });

    expect(prisma.shoppingListItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Milk", sortOrder: 3, addedById: "cmember0000000000002" }) }),
    );
  });

  it("rejects when the list isn't visible to the acting member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(addShoppingListItem("list_1", { name: "Milk" })).rejects.toThrow(NotFoundError);
    expect(prisma.shoppingListItem.create).not.toHaveBeenCalled();
  });
});
