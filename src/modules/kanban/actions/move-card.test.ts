import { beforeEach, describe, expect, it, vi } from "vitest";
import { moveCard } from "./move-card";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getColumn } from "../queries/get-column";
import { completeTask, reopenTask } from "@/modules/tasks";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-column", () => ({ getColumn: vi.fn() }));
vi.mock("@/modules/tasks", () => ({ completeTask: vi.fn(), reopenTask: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("moveCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repositions the card and completes the task when dropped into a done-typed column (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "ccolumn0000000000001",
      boardId: "cboard00000000000001",
      columnType: "done",
    } as never);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({
      id: "ctask00000000000001",
      completedAt: null,
    } as never);

    await moveCard({ taskId: "ctask00000000000001", columnId: "ccolumn0000000000001", boardPosition: 1.5 });

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "ctask00000000000001", householdId: "household_1" },
      data: { boardId: "cboard00000000000001", columnId: "ccolumn0000000000001", boardPosition: 1.5 },
    });
    expect(completeTask).toHaveBeenCalledWith("ctask00000000000001");
    expect(reopenTask).not.toHaveBeenCalled();
  });

  it("reopens the task when dragged out of a done-typed column", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "ccolumn0000000000002",
      boardId: "cboard00000000000001",
      columnType: "todo",
    } as never);
    vi.mocked(prisma.task.findFirst).mockResolvedValue({
      id: "ctask00000000000001",
      completedAt: new Date(),
    } as never);

    await moveCard({ taskId: "ctask00000000000001", columnId: "ccolumn0000000000002", boardPosition: 1 });

    expect(reopenTask).toHaveBeenCalledWith("ctask00000000000001");
    expect(completeTask).not.toHaveBeenCalled();
  });

  it("rejects when the task doesn't exist in the acting member's household (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "ccolumn0000000000002",
      boardId: "cboard00000000000001",
      columnType: "todo",
    } as never);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    await expect(
      moveCard({ taskId: "ctask00000000000099", columnId: "ccolumn0000000000002", boardPosition: 1 }),
    ).rejects.toThrow("Task not found.");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
