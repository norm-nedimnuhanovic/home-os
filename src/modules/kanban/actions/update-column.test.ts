import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateColumn } from "./update-column";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getBoard } from "../queries/get-board";
import { getColumn } from "../queries/get-column";

vi.mock("@/lib/db", () => ({
  prisma: {
    kanbanColumn: { update: vi.fn() },
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

describe("updateColumn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renames/retypes the column when the acting member created the board (happy path)", async () => {
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
    vi.mocked(prisma.kanbanColumn.update).mockResolvedValue({ id: "col_1" } as never);

    await updateColumn("board_1", "col_1", { name: "Finished", columnType: "done" } as never);

    expect(prisma.kanbanColumn.update).toHaveBeenCalledWith({
      where: { id: "col_1", householdId: "household_1" },
      data: { name: "Finished", columnType: "done" },
    });
  });

  it("rejects when the acting member didn't create the board (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
    } as never);

    await expect(
      updateColumn("board_1", "col_1", { name: "Finished" } as never),
    ).rejects.toThrow("Only the board's creator can rename or retype a column.");
    expect(prisma.kanbanColumn.update).not.toHaveBeenCalled();
  });
});
