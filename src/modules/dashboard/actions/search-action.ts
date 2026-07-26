"use server";

import { requireMember } from "@/lib/auth/session";
import { searchEverything } from "../queries/search";

// searchEverything() itself is a plain query function, meant for Server
// Component callers — this is the thin, session-resolving wrapper the
// client-side search/command-palette UI actually calls.
export async function search(query: string) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  return searchEverything(member, query);
}
