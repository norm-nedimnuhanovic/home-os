import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBoardWithColumns } from "./get-board-with-columns";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    kanbanBoard: { findFirst: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getBoardWithColumns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the board by visibility+id, and its cards independently by the Task's own visibility", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.kanbanBoard.findFirst).mockResolvedValue({
      id: "board_1",
      columns: [],
    } as never);
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: "task_1" }] as never);

    const result = await getBoardWithColumns(actingMember as never, "board_1");

    expect(prisma.kanbanBoard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [expect.objectContaining({ householdId: "household_1" }), { id: "board_1" }] },
      }),
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ householdId: "household_1" }),
            { boardId: "board_1", archivedAt: null },
          ],
        },
      }),
    );
    expect(result.tasks).toHaveLength(1);
  });

  it("throws NotFoundError when the board isn't visible to the acting member", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.kanbanBoard.findFirst).mockResolvedValue(null);

    await expect(getBoardWithColumns(actingMember as never, "board_missing")).rejects.toThrow(
      NotFoundError,
    );
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
