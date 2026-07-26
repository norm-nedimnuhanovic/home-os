import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBoard } from "./get-board";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { kanbanBoard: { findFirst: vi.fn() } },
}));

describe("getBoard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.kanbanBoard.findFirst).mockResolvedValue({ id: "board_1" } as never);

    const result = await getBoard("household_1", "board_1");

    expect(prisma.kanbanBoard.findFirst).toHaveBeenCalledWith({
      where: { id: "board_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "board_1" });
  });

  it("throws NotFoundError instead of returning null when the board isn't in this household", async () => {
    vi.mocked(prisma.kanbanBoard.findFirst).mockResolvedValue(null);

    await expect(getBoard("household_1", "board_missing")).rejects.toThrow(NotFoundError);
  });
});
