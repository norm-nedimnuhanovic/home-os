import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTask } from "./update-task";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getTask } from "../queries/get-task";
import { regenerateTaskDueReminder } from "./regenerate-task-due-reminder";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-task", () => ({ getTask: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("./regenerate-task-due-reminder", () => ({ regenerateTaskDueReminder: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("updateTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the task's fields when the acting member created it (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTask).mockResolvedValue({
      id: "task_1",
      householdId: "household_1",
      createdById: "member_1",
      assigneeId: null,
    } as never);
    vi.mocked(prisma.task.update).mockResolvedValue({ id: "task_1" } as never);

    await updateTask("task_1", { title: "Updated title" } as never);

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task_1", householdId: "household_1" },
        data: expect.objectContaining({ title: "Updated title" }),
      }),
    );
    expect(regenerateTaskDueReminder).toHaveBeenCalledWith({ id: "task_1" }, false, 1, "days", "member_1");
  });

  it("rejects when the acting member neither created nor is assigned to the task (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getTask).mockResolvedValue({
      id: "task_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
      assigneeId: "cmember0000000000003",
    } as never);

    await expect(updateTask("task_1", { title: "Updated title" } as never)).rejects.toThrow(
      "You can only edit tasks you created or are assigned to.",
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
