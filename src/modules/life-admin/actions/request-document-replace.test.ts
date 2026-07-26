import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDocumentReplace } from "./request-document-replace";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { document: { findFirst: vi.fn() }, objectShare: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
// See request-document-upload.test.ts — the real module imports
// "server-only", unresolvable under Vitest outside Next's own bundler.
vi.mock("@/lib/storage/paths", () => ({
  buildDocumentObjectPath: (householdId: string, documentId: string, fileName: string) =>
    `households/${householdId}/documents/${documentId}/fake-token-${fileName}`,
}));

const documentRow = { id: "doc_1", householdId: "household_1", uploadedById: "cmember0000000000001" };

describe("requestDocumentReplace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mints a signed upload URL for the uploader (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);
    const createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { token: "tok_123" }, error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUploadUrl }) },
    } as never);

    const result = await requestDocumentReplace("doc_1", {
      fileName: "receipt-v2.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
    });

    expect(result.token).toBe("tok_123");
  });

  it("blocks a plain member who neither uploaded it nor is an admin/owner (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(documentRow as never);

    await expect(
      requestDocumentReplace("doc_1", { fileName: "x.pdf", mimeType: "application/pdf", fileSizeBytes: 1024 }),
    ).rejects.toThrow(ForbiddenError);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
