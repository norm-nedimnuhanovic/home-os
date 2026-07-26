import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getTasksDueInRange } from "./get-tasks-due-in-range";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getTasksDueInRange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId/visibility and by dueDate falling within the range", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.task.findMany).mockResolvedValue([{ id: "task_1" }] as never);

    const from = new Date("2026-08-01");
    const to = new Date("2026-08-31");
    const result = await getTasksDueInRange(actingMember as never, from, to);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ householdId: "household_1", OR: expect.any(Array) }),
            { dueDate: { gte: from, lte: to } },
          ],
        },
      }),
    );
    expect(result).toHaveLength(1);
  });
});
