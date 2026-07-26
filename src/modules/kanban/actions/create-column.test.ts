import { beforeEach, describe, expect, it, vi } from "vitest";
import { createColumn } from "./create-column";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getBoard } from "../queries/get-board";

vi.mock("@/lib/db", () => ({
  prisma: {
    kanbanColumn: { findFirst: vi.fn(), create: vi.fn() },
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

describe("createColumn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends a column at the end of the board when the acting member created it (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "member_1",
    } as never);
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({ position: 3 } as never);
    vi.mocked(prisma.kanbanColumn.create).mockResolvedValue({ id: "col_new" } as never);

    await createColumn("board_1", { name: "Blocked" } as never);

    expect(prisma.kanbanColumn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          boardId: "board_1",
          householdId: "household_1",
          name: "Blocked",
          position: 4,
        }),
      }),
    );
  });

  it("rejects when the acting member didn't create the board (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
    } as never);

    await expect(createColumn("board_1", { name: "Blocked" } as never)).rejects.toThrow(
      "Only the board's creator can add columns.",
    );
    expect(prisma.kanbanColumn.create).not.toHaveBeenCalled();
  });
});
