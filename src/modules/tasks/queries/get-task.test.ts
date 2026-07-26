import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getTask } from "./get-task";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { task: { findFirst: vi.fn() } },
}));

describe("getTask", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue({ id: "task_1" } as never);

    const result = await getTask("household_1", "task_1");

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "task_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "task_1" });
  });

  it("throws NotFoundError instead of returning null when the task isn't in this household", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null);

    await expect(getTask("household_1", "task_missing")).rejects.toThrow(NotFoundError);
  });
});
