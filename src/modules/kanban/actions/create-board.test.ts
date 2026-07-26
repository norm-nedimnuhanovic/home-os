import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBoard } from "./create-board";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    kanbanBoard: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("createBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a board scoped to the acting member's household with default columns (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.kanbanBoard.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.kanbanBoard.create).mockResolvedValue({
      id: "board_1",
      householdId: "household_1",
    } as never);

    await createBoard({ name: "Household Chores" } as never);

    expect(prisma.kanbanBoard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          createdById: "member_1",
          name: "Household Chores",
          position: 1,
          columns: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({ columnType: "done" }),
            ]),
          }),
        }),
      }),
    );
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(createBoard({ name: "Household Chores" } as never)).rejects.toThrow(
      "Not authenticated",
    );
    expect(prisma.kanbanBoard.create).not.toHaveBeenCalled();
  });
});
