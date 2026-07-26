import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDocumentUpload } from "./request-document-upload";
import { requireMember } from "@/lib/auth/session";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));
// The real module imports "server-only", which Vitest (like tsx) can't
// resolve outside Next's own bundler — mock it with an equivalent-shaped
// fake instead of letting the real file load.
vi.mock("@/lib/storage/paths", () => ({
  buildDocumentObjectPath: (householdId: string, documentId: string, fileName: string) =>
    `households/${householdId}/documents/${documentId}/fake-token-${fileName}`,
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("requestDocumentUpload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mints a signed upload URL for an allowed file (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    const createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { token: "tok_123" }, error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUploadUrl }) },
    } as never);

    const result = await requestDocumentUpload({
      fileName: "receipt.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
    });

    expect(result.token).toBe("tok_123");
    expect(result.path).toContain("households/household_1/documents/");
  });

  it("rejects a disallowed file type before ever calling Storage (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);

    await expect(
      requestDocumentUpload({ fileName: "archive.zip", mimeType: "application/zip", fileSizeBytes: 1024 }),
    ).rejects.toThrow();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
