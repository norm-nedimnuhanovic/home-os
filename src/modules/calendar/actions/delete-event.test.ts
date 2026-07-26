import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteEvent } from "./delete-event";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getEvent } from "../queries/get-event";

vi.mock("@/lib/db", () => ({
  prisma: { event: { delete: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-event", () => ({ getEvent: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("deleteEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the event when the acting member created it (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getEvent).mockResolvedValue({
      id: "event_1",
      householdId: "household_1",
      createdById: "member_1",
    } as never);

    await deleteEvent("event_1");

    expect(prisma.event.delete).toHaveBeenCalledWith({
      where: { id: "event_1", householdId: "household_1" },
    });
  });

  it("rejects when the acting member didn't create the event (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getEvent).mockResolvedValue({
      id: "event_1",
      householdId: "household_1",
      createdById: "cmember0000000000002",
    } as never);

    await expect(deleteEvent("event_1")).rejects.toThrow("Only the event's creator can delete it.");
    expect(prisma.event.delete).not.toHaveBeenCalled();
  });
});
