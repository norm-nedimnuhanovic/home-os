// Deliberately does NOT import "@/lib/supabase/admin" — that file (and
// anything importing "server-only") resolves fine inside Next.js's bundler
// but throws "Cannot find module 'server-only'" when run standalone via
// `tsx`, outside Next's build pipeline (confirmed empirically; same
// gotcha `scripts/setup-storage-bucket.ts` already works around, per
// docs/toolkit.md §1 point 3). This constructs its own minimal admin
// client instead, only when ALLOW_DEV_SEED_AUTH_USERS is actually true.
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../../src/lib/db";
import {
  SEED_HOUSEHOLD_ID,
  SEED_MEMBER_OWNER_ID,
  SEED_MEMBER_ADMIN_ID,
  SEED_MEMBER_MEMBER_ID,
  SEED_DEV_PASSWORD,
} from "./constants";

const SEED_MEMBERS = [
  { id: SEED_MEMBER_OWNER_ID, displayName: "Sam Rivera", email: "sam@seed.local", role: "owner" as const, colorTag: "#2563eb" },
  { id: SEED_MEMBER_ADMIN_ID, displayName: "Priya Rivera", email: "priya@seed.local", role: "admin" as const, colorTag: "#16a34a" },
  { id: SEED_MEMBER_MEMBER_ID, displayName: "Jordan Rivera", email: "jordan@seed.local", role: "member" as const, colorTag: "#d97706" },
];

export async function seedHouseholdAndMembers() {
  const household = await prisma.household.create({
    data: {
      id: SEED_HOUSEHOLD_ID,
      name: "The Rivera Household",
      timezone: "America/Denver",
      baseCurrency: "USD",
      status: "active",
    },
  });

  const [owner, admin, member] = await Promise.all(
    SEED_MEMBERS.map(async (m) => {
      const supabaseUserId = await resolveSeedMemberAuthId(m.email);
      return prisma.member.create({
        data: {
          id: m.id,
          householdId: household.id,
          supabaseUserId,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          status: "active",
          colorTag: m.colorTag,
          emailVerifiedAt: new Date(),
          joinedAt: new Date(),
        },
      });
    }),
  );

  return { household, owner, admin, member };
}

/**
 * Returns a Member's supabaseUserId. Two modes:
 *
 *  - ALLOW_DEV_SEED_AUTH_USERS !== "true" (the default): returns a
 *    placeholder id and makes zero network calls. Every DB-level thing
 *    works (visibility checks, assigneeId/createdById, Prisma Studio
 *    browsing) — you just can't sign in locally as this member.
 *  - ALLOW_DEV_SEED_AUTH_USERS === "true": creates (or reuses, on repeat
 *    runs) a real Supabase Auth user via the admin client, `email_confirm:
 *    true`, so you can actually log in locally with SEED_DEV_PASSWORD —
 *    same admin-client shape docs/auth.md §5 uses for invite acceptance.
 *
 * Never set ALLOW_DEV_SEED_AUTH_USERS=true against a real hosted Supabase
 * project (docs/seeding.md §7.2) — local dev / sandboxed agent runs only.
 */
async function resolveSeedMemberAuthId(email: string): Promise<string> {
  if (process.env.ALLOW_DEV_SEED_AUTH_USERS !== "true") {
    return `seed-placeholder-${email}`;
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEED_DEV_PASSWORD,
    email_confirm: true,
  });

  if (error) {
    // Already exists from a previous seed run (reset.ts never deletes auth
    // users — re-seeding shouldn't invalidate a session you're still
    // logged in with) — look it up and reuse its id instead of failing.
    const { data: list, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = list.users.find((u) => u.email === email);
    if (existing) return existing.id;
    throw error;
  }

  return data.user.id;
}
