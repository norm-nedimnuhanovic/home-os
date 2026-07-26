import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncObjectShares } from "./sync-object-shares";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn() }));

const baseParams = {
  householdId: "household_1",
  moduleKey: "tasks",
  objectType: "Task",
  objectId: "task_1",
  sharedByMemberId: "member_1",
};

describe("syncObjectShares", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
  });

  it("recreates the full share set, scoped by householdId (happy path)", async () => {
    await syncObjectShares({ ...baseParams, sharedWithMemberIds: ["member_2", "member_3"] });

    expect(prisma.objectShare.deleteMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", moduleKey: "tasks", objectType: "Task", objectId: "task_1" },
    });
    expect(prisma.objectShare.createMany).toHaveBeenCalledWith({
      data: [
        {
          householdId: "household_1",
          moduleKey: "tasks",
          objectType: "Task",
          objectId: "task_1",
          sharedWithMemberId: "member_2",
          sharedByMemberId: "member_1",
        },
        {
          householdId: "household_1",
          moduleKey: "tasks",
          objectType: "Task",
          objectId: "task_1",
          sharedWithMemberId: "member_3",
          sharedByMemberId: "member_1",
        },
      ],
    });
  });

  it("emits share.received only for members newly added to the share set", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([{ sharedWithMemberId: "member_2" }] as never);

    await syncObjectShares({ ...baseParams, sharedWithMemberIds: ["member_2", "member_3"] });

    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(
      "household_1",
      "share.received",
      { moduleKey: "tasks", objectType: "Task", objectId: "task_1", sharedWithMemberId: "member_3", sharedByMemberId: "member_1" },
      "member_1",
    );
  });

  it("skips deleteMany's createMany call and emits nothing when the share list is empty", async () => {
    await syncObjectShares({ ...baseParams, sharedWithMemberIds: [] });

    expect(prisma.objectShare.deleteMany).toHaveBeenCalled();
    expect(prisma.objectShare.createMany).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });
});
