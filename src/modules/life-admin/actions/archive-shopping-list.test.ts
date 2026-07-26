import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveShoppingList } from "./archive-shopping-list";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { shoppingList: { findFirst: vi.fn(), update: vi.fn() }, objectShare: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("archiveShoppingList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives a visible list (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue({ id: "list_1", items: [] } as never);
    vi.mocked(prisma.shoppingList.update).mockResolvedValue({ id: "list_1", isArchived: true } as never);

    await archiveShoppingList("list_1");

    expect(prisma.shoppingList.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isArchived: true } }));
  });

  it("rejects when the list isn't visible to the acting member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.shoppingList.findFirst).mockResolvedValue(null);

    await expect(archiveShoppingList("list_1")).rejects.toThrow(NotFoundError);
    expect(prisma.shoppingList.update).not.toHaveBeenCalled();
  });
});
