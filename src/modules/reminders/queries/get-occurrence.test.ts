import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getOccurrence } from "./get-occurrence";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { reminderOccurrence: { findFirst: vi.fn() } },
}));

describe("getOccurrence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, and includes the parent reminder", async () => {
    vi.mocked(prisma.reminderOccurrence.findFirst).mockResolvedValue({ id: "occ_1" } as never);

    const result = await getOccurrence("household_1", "occ_1");

    expect(prisma.reminderOccurrence.findFirst).toHaveBeenCalledWith({
      where: { id: "occ_1", householdId: "household_1" },
      include: { reminder: true },
    });
    expect(result).toEqual({ id: "occ_1" });
  });

  it("throws NotFoundError instead of returning null when the occurrence isn't in this household", async () => {
    vi.mocked(prisma.reminderOccurrence.findFirst).mockResolvedValue(null);

    await expect(getOccurrence("household_1", "occ_missing")).rejects.toThrow(NotFoundError);
  });
});
