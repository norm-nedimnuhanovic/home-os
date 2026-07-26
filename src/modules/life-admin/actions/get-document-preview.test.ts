import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentPreview } from "./get-document-preview";
import { requireMember } from "@/lib/auth/session";
import { getDocumentDownloadUrl } from "../queries/get-document-download-url";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-document-download-url", () => ({ getDocumentDownloadUrl: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("getDocumentPreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates to getDocumentDownloadUrl for the acting member (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(getDocumentDownloadUrl).mockResolvedValue({ url: "https://signed.example/x", mimeType: "application/pdf", fileSizeBytes: 100, title: "Receipt" } as never);

    const result = await getDocumentPreview("doc_1");

    expect(getDocumentDownloadUrl).toHaveBeenCalledWith(actingMember, "doc_1");
    expect(result.url).toBe("https://signed.example/x");
  });

  it("propagates NotFoundError when the document isn't visible (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(getDocumentDownloadUrl).mockRejectedValue(new NotFoundError("Document not found."));

    await expect(getDocumentPreview("doc_missing")).rejects.toThrow(NotFoundError);
  });
});
