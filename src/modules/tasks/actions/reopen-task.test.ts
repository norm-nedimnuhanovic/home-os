import { beforeEach, describe, expect, it, vi } from "vitest";
import { reopenTask } from "./reopen-task";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { update: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("reopenTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears completedAt and completedById, scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.task.update).mockResolvedValue({ id: "task_1" } as never);

    await reopenTask("task_1");

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: "task_1", householdId: "household_1" },
      data: { completedAt: null, completedById: null },
    });
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(reopenTask("task_1")).rejects.toThrow("Not authenticated");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
