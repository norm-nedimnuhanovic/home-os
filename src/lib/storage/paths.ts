import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Builds the Storage object key for one upload attempt. The `uploadToken`
 * segment (a fresh UUID per call) is what makes replacing a Document's file
 * safe — the new object never collides with the one it's about to replace,
 * so the old file can be deleted only after the new one is confirmed on
 * disk, never before (docs/upload.md §5.5).
 */
export function buildDocumentObjectPath(householdId: string, documentId: string, fileName: string): string {
  return `households/${householdId}/documents/${documentId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
}
