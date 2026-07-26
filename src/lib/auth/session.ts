import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { prismaAuthBootstrap } from "@/lib/db";

export const requireMember = cache(async () => {
  const supabase = await createServerSupabaseClient();

  // ALWAYS getUser(), NEVER getSession(), on the server. getSession() reads
  // the JWT out of the cookie without contacting Supabase Auth — it can be
  // spoofed by anything that can write cookies. getUser() revalidates
  // against Supabase's server on every call. This is the one rule in this
  // document with zero exceptions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Bypasses the tenant guard deliberately — see prismaAuthBootstrap's
  // doc comment in @/lib/db. This is the one query in the app that
  // resolves householdId itself, rather than assuming it's already known.
  const member = await prismaAuthBootstrap.member.findUnique({
    where: { supabaseUserId: user.id },
    include: { household: true },
  });

  // status !== "active" (suspended/removed) is treated as logged out here,
  // as defense in depth on top of the Supabase-level ban in docs/auth.md §7
  // — don't rely on the ban alone. Same treatment one level up: a household
  // that's "closed" (closeHousehold(), plan.md §2.2) or "suspended"
  // (operator-only, no in-app trigger in V1) locks out every one of its
  // members on their very next request — this is the actual mechanism that
  // makes closing a household do anything at all, not just a cosmetic flag.
  if (!member || member.status !== "active" || member.household.status !== "active") return null;

  return member; // { id, householdId, role, displayName, ..., household: Household }
});

// The shape requireMember() resolves to — not separately maintained, so it
// can never drift from the real function (docs/access-control.md §2).
export type ActingMember = NonNullable<Awaited<ReturnType<typeof requireMember>>>;
