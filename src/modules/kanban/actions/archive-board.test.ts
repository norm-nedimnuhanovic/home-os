import { beforeEach, describe, expect, it, vi } from "vitest";
import { archiveBoard } from "./archive-board";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getBoard } from "../queries/get-board";

vi.mock("@/lib/db", () => ({
  prisma: {
    kanbanBoard: { update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-board", () => ({ getBoard: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("archiveBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets archivedAt when the acting member created the board (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "member_1",
    } as never);
    vi.mocked(prisma.kanbanBoard.update).mockResolvedValue({ id: "board_1" } as never);

    await archiveBoard("board_1");

    expect(prisma.kanbanBoard.update).toHaveBeenCalledWith({
      where: { id: "board_1", householdId: "household_1" },
      data: expect.objectContaining({ archivedAt: expect.any(Date) }),
    });
  });

  it("rejects when the acting member didn't create the board (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
    } as never);

    await expect(archiveBoard("board_1")).rejects.toThrow("Only the board's creator can archive it.");
    expect(prisma.kanbanBoard.update).not.toHaveBeenCalled();
  });
});
