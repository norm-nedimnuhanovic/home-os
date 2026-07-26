import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeTask } from "./complete-task";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitTaskCompleted } from "../events/emitters";
import { cancelTaskDueReminder } from "./regenerate-task-due-reminder";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitTaskCompleted: vi.fn() }));
vi.mock("./regenerate-task-due-reminder", () => ({ cancelTaskDueReminder: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("completeTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the task completed, scoped to the acting member's household, and emits task.completed (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.task.update).mockResolvedValue({ id: "task_1" } as never);

    await completeTask("task_1");

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "task_1", householdId: "household_1" },
      data: expect.objectContaining({ completedById: "member_1" }),
    });
    expect(cancelTaskDueReminder).toHaveBeenCalledWith({ id: "task_1" });
    expect(emitTaskCompleted).toHaveBeenCalledWith("household_1", "task_1", "member_1");
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(completeTask("task_1")).rejects.toThrow("Not authenticated");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
