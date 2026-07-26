import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleTasks } from "./get-visible-tasks";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getVisibleTasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and includes the visibility OR clause", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: "task_1" }] as never);

    const result = await getVisibleTasks(actingMember as never);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ householdId: "household_1", OR: expect.any(Array) }),
            expect.any(Object),
          ],
        },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("adds an optional filter (e.g. boardId) as a second AND branch, not merged into the visibility clause", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);

    await getVisibleTasks(actingMember as never, { boardId: "board_1" });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [expect.any(Object), expect.objectContaining({ boardId: "board_1" })] },
      }),
    );
  });

  it("filters to overdue-or-due-by dueBefore with no lower bound (Dashboard's Today view)", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.task.findMany).mockResolvedValue([]);
    const endOfToday = new Date("2026-07-24T21:59:59.999Z");

    await getVisibleTasks(actingMember as never, { completed: false, dueBefore: endOfToday });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.any(Object),
            expect.objectContaining({ completedAt: null, dueDate: { lte: endOfToday } }),
          ],
        },
      }),
    );
  });
});
