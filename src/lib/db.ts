import { PrismaClient } from "@prisma/client";
import { tenantGuardExtension } from "./db/tenant-guard";
import { decimalSerializeExtension } from "./db/decimal-serialize";

// Standard Next.js dev-mode workaround: hot module reloading would otherwise
// instantiate a new PrismaClient (and a new connection pool) on every edit.
// Not part of docs/orm-conventions.md §3.2's illustrative snippet, but a
// well-known necessity alongside it — see https://pris.ly/d/help/next-js-best-practices.
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

const prismaClient = globalForPrisma.prismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prismaClient;
}

export const prisma = prismaClient.$extends(tenantGuardExtension).$extends(decimalSerializeExtension);

// The one narrow, explicit bypass of the guard above: resolving which
// household an unauthenticated request belongs to necessarily happens
// before householdId is known — that's the whole point of the lookup.
// Two legitimate cases, both keyed on a column that's globally `@unique`
// (not just unique per household), so a query keyed on it alone can only
// ever match one row, in exactly one household:
// - `Member.supabaseUserId` (docs/auth.md §1) — `requireMember()`, login's
//   `lastLoginAt` touch, the confirmation callback's `emailVerifiedAt` touch.
// - `Invite.token` (docs/auth.md §5) — resolving which household/role an
//   Invite grants, before the invitee has a Member row at all.
// Never use this for anything else — every other query goes through
// `prisma` above.
export const prismaAuthBootstrap = prismaClient;
