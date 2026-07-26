import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getDocument } from "./get-document";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { document: { findFirst: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the document when visibility permits it", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.document.findFirst).mockResolvedValue({ id: "document_1" } as never);

    const result = await getDocument(actingMember as never, "document_1");

    expect(result).toEqual({ id: "document_1" });
  });

  it("throws NotFoundError when the document doesn't exist or isn't visible", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null);

    await expect(getDocument(actingMember as never, "document_missing")).rejects.toThrow(NotFoundError);
  });
});
