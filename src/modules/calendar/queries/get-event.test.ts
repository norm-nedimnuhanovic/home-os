import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getEvent } from "./get-event";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { event: { findFirst: vi.fn() } },
}));

describe("getEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue({ id: "event_1" } as never);

    const result = await getEvent("household_1", "event_1");

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: "event_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "event_1" });
  });

  it("throws NotFoundError instead of returning null when the event isn't in this household", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValue(null);

    await expect(getEvent("household_1", "event_missing")).rejects.toThrow(NotFoundError);
  });
});
