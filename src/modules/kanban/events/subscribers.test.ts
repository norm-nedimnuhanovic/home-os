import { beforeEach, describe, expect, it, vi } from "vitest";
import { onTaskCompleted } from "./subscribers";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findFirst: vi.fn(), update: vi.fn() },
    kanbanColumn: { findFirst: vi.fn() },
  },
}));

describe("onTaskCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves the card to the board's first done-typed column", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue({
      id: "task_1",
      boardId: "board_1",
      columnId: "col_todo",
    } as never);
    // Current column lookup (not done) then the "first done column" lookup.
    vi.mocked(prisma.kanbanColumn.findFirst)
      .mockResolvedValueOnce({ id: "col_todo", columnType: "todo" } as never)
      .mockResolvedValueOnce({ id: "col_done", columnType: "done" } as never);

    await onTaskCompleted({ taskId: "task_1", completedById: "member_1" }, "household_1");

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "task_1", householdId: "household_1" },
      data: { columnId: "col_done" },
    });
  });

  it("no-ops when the task has no board", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue({
      id: "task_1",
      boardId: null,
      columnId: null,
    } as never);

    await onTaskCompleted({ taskId: "task_1", completedById: "member_1" }, "household_1");

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("no-ops when the board has no done-typed column", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue({
      id: "task_1",
      boardId: "board_1",
      columnId: "col_todo",
    } as never);
    vi.mocked(prisma.kanbanColumn.findFirst)
      .mockResolvedValueOnce({ id: "col_todo", columnType: "todo" } as never)
      .mockResolvedValueOnce(null);

    await onTaskCompleted({ taskId: "task_1", completedById: "member_1" }, "household_1");

    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("no-ops when the card was already dragged directly into a done-typed column", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue({
      id: "task_1",
      boardId: "board_1",
      columnId: "col_done_2",
    } as never);
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValueOnce({
      id: "col_done_2",
      columnType: "done",
    } as never);

    await onTaskCompleted({ taskId: "task_1", completedById: "member_1" }, "household_1");

    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
