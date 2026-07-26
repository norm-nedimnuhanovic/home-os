import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateShoppingList } from "./update-shopping-list";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    shoppingList: { findFirst: vi.fn(), update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000002", householdId: "household_1", role: "member" as const };

describe("updateShoppingList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a household member who did NOT create the list edit it (plan.md §9 Q30)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({
      id: "list_1",
      householdId: "household_1",
      createdById: "cmember0000000000001",
      visibility: "household",
      items: [],
    } as never);
    vi.mocked(prisma.shoppingList.update).mockResolvedValue({ id: "list_1" } as never);

    await expect(updateShoppingList("list_1", { name: "Renamed" })).resolves.toBeDefined();
    expect(prisma.shoppingList.update).toHaveBeenCalled();
  });

  it("blocks a member with no visibility into a private list from editing it", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(updateShoppingList("list_1", { name: "Renamed" })).rejects.toThrow(NotFoundError);
    expect(prisma.shoppingList.update).not.toHaveBeenCalled();
  });
});
