import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBoards } from "./get-boards";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    kanbanBoard: { findMany: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getBoards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId/visibility and excludes archived boards", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.kanbanBoard.findMany).mockResolvedValue([{ id: "board_1" }] as never);

    const result = await getBoards(actingMember as never);

    expect(prisma.kanbanBoard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ householdId: "household_1", OR: expect.any(Array) }),
            { archivedAt: null },
          ],
        },
      }),
    );
    expect(result).toHaveLength(1);
  });
});
