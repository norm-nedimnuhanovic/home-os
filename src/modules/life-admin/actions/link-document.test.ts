import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkDocument } from "./link-document";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { document: { findFirst: vi.fn(), update: vi.fn() }, objectShare: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitDocumentLinked: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const documentRow = { id: "doc_1", householdId: "household_1", uploadedById: "cmember0000000000001" };

describe("linkDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the uploader link the document to a renewal (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);
    vi.mocked(prisma.document.update).mockResolvedValue({ id: "doc_1" } as never);

    await linkDocument("doc_1", "renewal", "renewal_1");

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { linkedEntityType: "renewal", linkedEntityId: "renewal_1" } }),
    );
  });

  it("blocks a plain member who neither uploaded it nor is an admin/owner (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);

    await expect(linkDocument("doc_1", "renewal", "renewal_1")).rejects.toThrow(ForbiddenError);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});
