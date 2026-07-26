import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleRenewals } from "./get-visible-renewals";

vi.mock("@/lib/db", () => ({
  prisma: { renewal: { findMany: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getVisibleRenewals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and excludes long-expired renewals by default", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([{ id: "renewal_1" }] as never);

    await getVisibleRenewals(actingMember as never);

    expect(prisma.renewal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([expect.objectContaining({ status: { in: ["renewed", "cancelled"] } })]),
            }),
          ]),
        }),
      }),
    );
  });

  it("skips the grace-period filter when includeArchived is set", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([]);

    await getVisibleRenewals(actingMember as never, { includeArchived: true });

    const call = vi.mocked(prisma.renewal.findMany).mock.calls[0][0] as { where: { AND: unknown[] } };
    expect(call.where.AND).toContainEqual({});
  });
});
