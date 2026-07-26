import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent } from "./create-event";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitEventCreated } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { event: { create: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitEventCreated: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("createEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an event scoped to the acting member's household and emits event.created (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.event.create).mockResolvedValue({ id: "event_1" } as never);

    const startAt = new Date("2026-08-01T10:00:00Z");
    await createEvent({ title: "Dentist", startAt, endAt: startAt } as never);

    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          createdById: "member_1",
          title: "Dentist",
        }),
      }),
    );
    expect(emitEventCreated).toHaveBeenCalledWith("household_1", "event_1", "member_1");
  });

  it("rejects when endAt is before startAt before ever calling prisma.event.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(
      createEvent({
        title: "Dentist",
        startAt: new Date("2026-08-01T10:00:00Z"),
        endAt: new Date("2026-08-01T09:00:00Z"),
      } as never),
    ).rejects.toThrow();
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it("rejects when there's no authenticated member", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(
      createEvent({ title: "Dentist", startAt: new Date(), endAt: new Date() } as never),
    ).rejects.toThrow("Not authenticated");
    expect(prisma.event.create).not.toHaveBeenCalled();
  });
});
