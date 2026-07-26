import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentDownloadUrl } from "./get-document-download-url";
import { getDocument } from "./get-document";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("./get-document", () => ({ getDocument: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getDocumentDownloadUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mints a signed URL for a document the member can see", async () => {
    vi.mocked(getDocument).mockResolvedValue({
      id: "document_1",
      fileRef: "households/household_1/documents/document_1/abc-receipt.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      title: "Receipt",
    } as never);
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/abc" }, error: null });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as never);

    const result = await getDocumentDownloadUrl(actingMember as never, "document_1");

    expect(result.url).toBe("https://signed.example/abc");
    expect(createSignedUrl).toHaveBeenCalledWith(expect.stringContaining("document_1"), 300);
  });

  it("short-circuits before ever calling Storage when the member has no visibility into the document", async () => {
    vi.mocked(getDocument).mockRejectedValue(new NotFoundError("Document not found."));

    await expect(getDocumentDownloadUrl(actingMember as never, "document_missing")).rejects.toThrow(NotFoundError);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns a null url gracefully when the underlying Storage object is missing", async () => {
    vi.mocked(getDocument).mockResolvedValue({
      id: "document_1",
      fileRef: "households/household_1/documents/document_1/abc-receipt.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      title: "Receipt",
    } as never);
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    vi.mocked(createAdminSupabaseClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as never);

    const result = await getDocumentDownloadUrl(actingMember as never, "document_1");

    expect(result.url).toBeNull();
  });
});
