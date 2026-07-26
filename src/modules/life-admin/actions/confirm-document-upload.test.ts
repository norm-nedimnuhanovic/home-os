import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDocumentUpload } from "./confirm-document-upload";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitDocumentUploaded } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { document: { create: vi.fn() }, objectShare: { deleteMany: vi.fn(), createMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitDocumentUploaded: vi.fn(), emitDocumentLinked: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("confirmDocumentUpload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the Document row using the pre-generated id and path (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.document.create).mockResolvedValue({ id: "doc_1", title: "Receipt" } as never);

    await confirmDocumentUpload({
      documentId: "doc_1",
      path: "households/household_1/documents/doc_1/abc-receipt.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      title: "Receipt",
    });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: "doc_1", uploadedById: "cmember0000000000001", fileRef: expect.stringContaining("doc_1") }),
      }),
    );
    expect(emitDocumentUploaded).toHaveBeenCalled();
  });

  it("rejects when the declared file violates the upload policy even on the confirm step (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);

    await expect(
      confirmDocumentUpload({
        documentId: "doc_1",
        path: "households/household_1/documents/doc_1/abc-archive.zip",
        mimeType: "application/zip",
        fileSizeBytes: 1024,
        title: "Bad file",
      }),
    ).rejects.toThrow();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });
});
