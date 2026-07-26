import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateDocumentMetadata } from "./update-document-metadata";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst: vi.fn(), update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const documentRow = { id: "doc_1", householdId: "household_1", uploadedById: "cmember0000000000001" };

describe("updateDocumentMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the uploader update title/category/description (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);
    vi.mocked(prisma.document.update).mockResolvedValue({ id: "doc_1" } as never);

    await updateDocumentMetadata("doc_1", { title: "Updated title", category: "receipt" });

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: "Updated title", category: "receipt" }) }),
    );
  });

  it("blocks a plain member who neither uploaded it nor is an admin/owner (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);

    await expect(updateDocumentMetadata("doc_1", { title: "x", category: "other" })).rejects.toThrow(ForbiddenError);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});
