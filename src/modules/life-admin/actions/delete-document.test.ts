import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDocument } from "./delete-document";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst: vi.fn(), delete: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const documentRow = {
  id: "doc_1",
  householdId: "household_1",
  uploadedById: "cmember0000000000001",
  fileRef: "households/household_1/documents/doc_1/abc-receipt.pdf",
  visibility: "household",
};

describe("deleteDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the uploader delete their own document (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({ storage: { from: vi.fn().mockReturnValue({ remove }) } } as never);

    await deleteDocument("doc_1");

    expect(remove).toHaveBeenCalledWith([documentRow.fileRef]);
    expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: "doc_1", householdId: "household_1" } });
  });

  it("blocks a plain member who neither uploaded it nor is an admin/owner (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);

    await expect(deleteDocument("doc_1")).rejects.toThrow(ForbiddenError);
    expect(prisma.document.delete).not.toHaveBeenCalled();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
