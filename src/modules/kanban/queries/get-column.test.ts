import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getColumn } from "./get-column";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { kanbanColumn: { findFirst: vi.fn() } },
}));

describe("getColumn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by both householdId and id, never id alone", async () => {
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({ id: "col_1" } as never);

    const result = await getColumn("household_1", "col_1");

    expect(prisma.kanbanColumn.findFirst).toHaveBeenCalledWith({
      where: { id: "col_1", householdId: "household_1" },
    });
    expect(result).toEqual({ id: "col_1" });
  });

  it("throws NotFoundError instead of returning null when the column isn't in this household", async () => {
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(null);

    await expect(getColumn("household_1", "col_missing")).rejects.toThrow(NotFoundError);
  });
});
