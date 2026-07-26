import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteColumn } from "./delete-column";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getBoard } from "../queries/get-board";
import { getColumn } from "../queries/get-column";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { updateMany: vi.fn() },
    kanbanColumn: { delete: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-board", () => ({ getBoard: vi.fn() }));
vi.mock("../queries/get-column", () => ({ getColumn: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("deleteColumn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unplaces the column's cards and deletes it when the acting member created the board (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "member_1",
    } as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "col_1",
      householdId: "household_1",
      boardId: "board_1",
    } as never);

    await deleteColumn("board_1", "col_1");

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", columnId: "col_1" },
      data: { boardId: null, columnId: null, boardPosition: null },
    });
    expect(prisma.kanbanColumn.delete).toHaveBeenCalledWith({
      where: { id: "col_1", householdId: "household_1" },
    });
  });

  it("rejects when the acting member didn't create the board (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
    } as never);

    await expect(deleteColumn("board_1", "col_1")).rejects.toThrow(
      "Only the board's creator can delete a column.",
    );
    expect(prisma.kanbanColumn.delete).not.toHaveBeenCalled();
  });
});
