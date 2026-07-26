import { prisma } from "@/lib/db";

// Enumerates Settings → Notifications' rows generically over
// `email_notification_category` `ModuleSurfaceRegistration`s (docs/email.md
// §2.3) rather than a hardcoded list — a module registering a new category
// shows up here with zero platform code changes. Defaults every toggle to
// "on" for a category with no NotificationPreference row yet, matching
// getEffectivePreference()'s own "missing row means on" rule.
export async function getNotificationCategories(householdId: string, memberId: string) {
  const [registrations, preferences] = await Promise.all([
    prisma.moduleSurfaceRegistration.findMany({
      where: { surface: "email_notification_category", enabled: true, module: { status: "active" } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.notificationPreference.findMany({ where: { householdId, memberId } }),
  ]);

  const preferenceByCategoryKey = new Map(preferences.map((pref) => [pref.categoryKey, pref]));

  return registrations.map((registration) => {
    const pref = preferenceByCategoryKey.get(registration.target);
    return {
      categoryKey: registration.target,
      label: registration.label,
      emailEnabled: pref?.emailEnabled ?? true,
      inAppEnabled: pref?.inAppEnabled ?? true,
      digestEnabled: pref?.digestEnabled ?? true,
    };
  });
}

export async function getDigestSubscription(householdId: string, memberId: string) {
  return prisma.digestSubscription.findUnique({ where: { memberId, householdId } });
}
