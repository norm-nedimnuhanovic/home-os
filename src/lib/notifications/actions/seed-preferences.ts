import { prisma } from "@/lib/db";

// The tenant-guard extension makes `prisma`'s own type incompatible with
// Prisma's plain `Prisma.TransactionClient` — derive `Db` from the
// extended client's own `$transaction` callback parameter instead, same as
// seedModuleGrantsForHousehold()/seedStarterCategories().
type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Run once per member — at signup (owner) and at Invite acceptance
 * (everyone else) — inside the same transaction that creates the Member
 * row. Also safe to re-run (upsert via skipDuplicates) whenever a module
 * registers a new `email_notification_category` (docs/email.md §2.3):
 * existing members pick up the new category with true/true/true defaults
 * instead of silently having no row (which still defaults to "on" per
 * getEffectivePreference()'s own fallback — this just makes the row
 * concrete and toggleable). Mirrors seedModuleGrantsForHousehold()'s
 * "seed at creation, upsert on registry growth" shape.
 */
export async function seedNotificationPreferencesForMember(db: Db, memberId: string, householdId: string) {
  const categories = await db.moduleSurfaceRegistration.findMany({
    where: { surface: "email_notification_category" },
    select: { target: true },
  });

  await db.notificationPreference.createMany({
    data: categories.map(({ target }) => ({
      householdId,
      memberId,
      categoryKey: target,
      emailEnabled: true,
      inAppEnabled: true,
      digestEnabled: true,
    })),
    skipDuplicates: true,
  });
}
