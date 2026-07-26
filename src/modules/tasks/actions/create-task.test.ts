import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask } from "./create-task";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitTaskAssigned } from "../events/emitters";
import { regenerateTaskDueReminder } from "./regenerate-task-due-reminder";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitTaskAssigned: vi.fn() }));
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

describe("createTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.task.create).mockResolvedValue({
      id: "task_1",
      householdId: "household_1",
      assigneeId: null,
    } as never);

    const result = await createTask({ title: "Take out the bins" } as never);

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          createdById: "member_1",
          title: "Take out the bins",
        }),
      }),
    );
    expect(result).toEqual({ id: "task_1", householdId: "household_1", assigneeId: null });
    expect(emitTaskAssigned).not.toHaveBeenCalled();
    expect(regenerateTaskDueReminder).not.toHaveBeenCalled();
  });

  it("creates a due-date reminder when remindBeforeDue is set", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    const created = { id: "task_3", householdId: "household_1", assigneeId: null, dueDate: new Date("2026-08-01") };
    vi.mocked(prisma.task.create).mockResolvedValue(created as never);

    await createTask({
      title: "Renew library card",
      dueDate: new Date("2026-08-01"),
      remindBeforeDue: true,
      remindLeadTimeValue: 2,
      remindLeadTimeUnit: "days",
    } as never);

    expect(regenerateTaskDueReminder).toHaveBeenCalledWith(created, true, 2, "days", "member_1");
  });

  it("emits task.assigned when an assignee is set", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.task.create).mockResolvedValue({
      id: "task_2",
      householdId: "household_1",
      assigneeId: "cmember0000000000002",
    } as never);

    await createTask({ title: "Water the plants", assigneeId: "cmember0000000000002" } as never);

    expect(emitTaskAssigned).toHaveBeenCalledWith("household_1", "task_2", "cmember0000000000002", "member_1");
  });

  it("rejects an invalid input before ever calling prisma.task.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createTask({ title: "" } as never)).rejects.toThrow();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("rejects when there's no authenticated member", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(createTask({ title: "Take out the bins" } as never)).rejects.toThrow(
      "Not authenticated",
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
