import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getCalendarRange } from "./get-calendar-range";
import { getTasksDueInRange } from "@/modules/tasks";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
  },
}));
vi.mock("@/modules/tasks", () => ({ getTasksDueInRange: vi.fn() }));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getCalendarRange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges Event rows (scoped by visibility + overlap with the range) and Tasks' due-date rows", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.event.findMany).mockResolvedValue([{ id: "event_1" }] as never);
    vi.mocked(getTasksDueInRange).mockResolvedValue([{ id: "task_1" }] as never);

    const from = new Date("2026-08-01");
    const to = new Date("2026-08-31");
    const result = await getCalendarRange(actingMember as never, from, to);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ householdId: "household_1", OR: expect.any(Array) }),
            { startAt: { lte: to }, endAt: { gte: from } },
          ],
        },
      }),
    );
    expect(getTasksDueInRange).toHaveBeenCalledWith(actingMember, from, to);
    expect(result).toEqual({ events: [{ id: "event_1" }], tasks: [{ id: "task_1" }] });
  });
});
