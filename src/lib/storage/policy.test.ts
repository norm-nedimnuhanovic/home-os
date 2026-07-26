import { describe, expect, it } from "vitest";
import { checkDocumentUploadPolicy, MAX_DOCUMENT_FILE_SIZE_BYTES } from "./policy";

describe("checkDocumentUploadPolicy", () => {
  it("accepts an allowed mime type under the size limit", () => {
    expect(checkDocumentUploadPolicy({ mimeType: "application/pdf", fileSizeBytes: 1024 })).toEqual({ ok: true });
    expect(checkDocumentUploadPolicy({ mimeType: "image/heic", fileSizeBytes: 1024 })).toEqual({ ok: true });
  });

  it("rejects a disallowed mime type", () => {
    const result = checkDocumentUploadPolicy({ mimeType: "application/zip", fileSizeBytes: 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the 10MB limit", () => {
    const result = checkDocumentUploadPolicy({
      mimeType: "application/pdf",
      fileSizeBytes: MAX_DOCUMENT_FILE_SIZE_BYTES + 1,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a file exactly at the size limit", () => {
    expect(
      checkDocumentUploadPolicy({ mimeType: "application/pdf", fileSizeBytes: MAX_DOCUMENT_FILE_SIZE_BYTES }),
    ).toEqual({ ok: true });
  });
});
