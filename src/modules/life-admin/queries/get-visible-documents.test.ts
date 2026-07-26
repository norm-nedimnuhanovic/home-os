import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleDocuments } from "./get-visible-documents";

vi.mock("@/lib/db", () => ({
  prisma: { document: { findMany: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getVisibleDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and includes the visibility clause", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.document.findMany).mockResolvedValue([{ id: "document_1" }] as never);

    const result = await getVisibleDocuments(actingMember as never);

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ householdId: "household_1" })]),
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("filters by linkedEntityType/linkedEntityId when provided", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.document.findMany).mockResolvedValue([]);

    await getVisibleDocuments(actingMember as never, { linkedEntityType: "renewal", linkedEntityId: "renewal_1" });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ linkedEntityType: "renewal" }),
            expect.objectContaining({ linkedEntityId: "renewal_1" }),
          ]),
        }),
      }),
    );
  });
});
