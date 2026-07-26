import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateEvent } from "./update-event";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEvent } from "../queries/get-event";

vi.mock("@/lib/db", () => ({
  prisma: { event: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-event", () => ({ getEvent: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("updateEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the event when the acting member created it (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getEvent).mockResolvedValue({
      id: "event_1",
      householdId: "household_1",
      createdById: "member_1",
    } as never);
    vi.mocked(prisma.event.update).mockResolvedValue({ id: "event_1" } as never);

    const startAt = new Date("2026-08-01T10:00:00Z");
    await updateEvent("event_1", { title: "Renamed", startAt, endAt: startAt } as never);

    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "event_1", householdId: "household_1" },
        data: expect.objectContaining({ title: "Renamed" }),
      }),
    );
  });

  it("rejects when the acting member didn't create the event (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getEvent).mockResolvedValue({
      id: "event_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
    } as never);

    const startAt = new Date("2026-08-01T10:00:00Z");
    await expect(
      updateEvent("event_1", { title: "Renamed", startAt, endAt: startAt } as never),
    ).rejects.toThrow("Only the event's creator can edit it.");
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});
