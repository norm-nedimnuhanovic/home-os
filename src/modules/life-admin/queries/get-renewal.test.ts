import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getRenewal } from "./get-renewal";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { renewal: { findFirst: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getRenewal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the renewal when visibility permits it", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue({ id: "renewal_1" } as never);

    const result = await getRenewal(actingMember as never, "renewal_1");

    expect(result).toEqual({ id: "renewal_1" });
  });

  it("throws NotFoundError when the renewal doesn't exist or isn't visible", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue(null);

    await expect(getRenewal(actingMember as never, "renewal_missing")).rejects.toThrow(NotFoundError);
  });
});
