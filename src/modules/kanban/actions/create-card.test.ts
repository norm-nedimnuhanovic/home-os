import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCard } from "./create-card";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getColumn } from "../queries/get-column";
import { completeTask } from "@/modules/tasks";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-column", () => ({ getColumn: vi.fn() }));
vi.mock("@/modules/tasks", () => ({ completeTask: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("createCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task placed on the board's column (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "ccolumn0000000000001",
      boardId: "cboard00000000000001",
      columnType: "todo",
    } as never);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "ctask00000000000001" } as never);

    await createCard("cboard00000000000001", "ccolumn0000000000001", { title: "Buy groceries" });

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          title: "Buy groceries",
          boardId: "cboard00000000000001",
          columnId: "ccolumn0000000000001",
          boardPosition: 1,
        }),
      }),
    );
    expect(completeTask).not.toHaveBeenCalled();
  });

  it("completes the task immediately when created straight into a done-typed column", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "ccolumn0000000000002",
      boardId: "cboard00000000000001",
      columnType: "done",
    } as never);
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.task.create).mockResolvedValue({ id: "ctask00000000000002" } as never);

    await createCard("cboard00000000000001", "ccolumn0000000000002", { title: "Already done" });

    expect(completeTask).toHaveBeenCalledWith("ctask00000000000002");
  });

  it("rejects when the column doesn't belong to the given board (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getColumn).mockResolvedValue({
      id: "ccolumn0000000000001",
      boardId: "cboard00000000000099",
      columnType: "todo",
    } as never);

    await expect(
      createCard("cboard00000000000001", "ccolumn0000000000001", { title: "Buy groceries" }),
    ).rejects.toThrow("Column does not belong to this board.");
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
