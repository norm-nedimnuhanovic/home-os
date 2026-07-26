import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role, server-only. The ONLY legitimate uses in this codebase are:
// creating a pre-confirmed auth.users row on invite acceptance, and
// banning/unbanning a user when Member.status changes (docs/auth.md §5, §7).
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
