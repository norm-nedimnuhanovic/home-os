import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmDocumentReplace } from "./confirm-document-replace";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst: vi.fn(), update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const documentRow = {
  id: "doc_1",
  householdId: "household_1",
  uploadedById: "cmember0000000000001",
  fileRef: "households/household_1/documents/doc_1/old-receipt.pdf",
};

describe("confirmDocumentReplace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates fileRef and deletes the OLD object only after the DB update succeeds (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);
    vi.mocked(prisma.document.update).mockResolvedValue({ id: "doc_1" } as never);
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({ storage: { from: vi.fn().mockReturnValue({ remove }) } } as never);

    await confirmDocumentReplace("doc_1", {
      newPath: "households/household_1/documents/doc_1/new-receipt.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 2048,
    });

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { fileRef: "households/household_1/documents/doc_1/new-receipt.pdf", mimeType: "application/pdf", fileSizeBytes: 2048 },
      }),
    );
    expect(remove).toHaveBeenCalledWith([documentRow.fileRef]);
  });

  it("blocks a plain member who neither uploaded it nor is an admin/owner (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);

    await expect(
      confirmDocumentReplace("doc_1", { newPath: "x", mimeType: "application/pdf", fileSizeBytes: 1024 }),
    ).rejects.toThrow(ForbiddenError);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});
