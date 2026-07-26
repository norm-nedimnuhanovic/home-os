// Deliberately does NOT import "@/lib/supabase/admin" — that file (and
// anything importing "server-only") resolves fine inside Next.js's bundler
// (which aliases "server-only" to a no-op internally) but throws
// "Cannot find module 'server-only'" when run standalone via `tsx`, outside
// Next's build pipeline. This script constructs its own minimal admin
// client instead, the same few lines, for a context "server-only"'s guard
// doesn't apply to anyway.
import { createClient } from "@supabase/supabase-js";
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_FILE_SIZE_BYTES, ALLOWED_DOCUMENT_MIME_TYPES } from "../src/lib/storage/policy";

// Run once per environment (local, staging, prod) — same "provision once,
// not per household" tier as prisma/seed.ts's platform-catalog rows
// (docs/upload.md §3.3). Idempotent: re-running against an already-
// provisioned bucket is a no-op, not an error.
async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.storage.createBucket(DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_DOCUMENT_FILE_SIZE_BYTES,
    allowedMimeTypes: [...ALLOWED_DOCUMENT_MIME_TYPES],
  });
  if (error && error.message !== "The resource already exists") throw error;
  console.log(`Storage bucket "${DOCUMENTS_BUCKET}" ready.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
