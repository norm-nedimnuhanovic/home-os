import { beforeEach, describe, expect, it, vi } from "vitest";
import { createShoppingList } from "./create-shopping-list";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { shoppingList: { create: vi.fn() }, objectShare: { deleteMany: vi.fn(), createMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("createShoppingList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a shopping list scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.shoppingList.create).mockResolvedValue({ id: "list_1" } as never);

    await createShoppingList({ name: "Weekly groceries", type: "shopping" });

    expect(prisma.shoppingList.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ householdId: "household_1", createdById: "cmember0000000000001" }) }),
    );
  });

  it("rejects a list with no name (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createShoppingList({ name: "" })).rejects.toThrow();
    expect(prisma.shoppingList.create).not.toHaveBeenCalled();
  });
});
