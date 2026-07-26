"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { nextDigestRunAt } from "@/lib/dates";
import type { DayOfWeek } from "@prisma/client";

export async function updateNotificationPreference(input: {
  categoryKey: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestEnabled: boolean;
}) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");

  // No role check needed — every member (owner/admin/member alike) manages
  // only their own NotificationPreference rows; there is no "manage
  // someone else's notification settings" ability in plan.md.
  await prisma.notificationPreference.upsert({
    where: {
      memberId_categoryKey: { memberId: member.id, categoryKey: input.categoryKey },
      householdId: member.householdId,
    },
    create: { householdId: member.householdId, memberId: member.id, ...input },
    update: input,
  });

  revalidatePath("/settings/notifications");
}

// One row per member (docs/email.md §5) — a separate, independent gate on
// top of each category's own digestEnabled toggle.
export async function updateDigestSubscription(input: {
  frequency: "off" | "daily" | "weekly";
  dayOfWeek?: DayOfWeek;
  timeOfDay: string;
}) {
  const member = await requireMember();
  if (!member) throw new Error("Not authenticated");
  if (input.frequency === "weekly" && !input.dayOfWeek) {
    throw new Error("dayOfWeek is required when frequency is weekly");
  }

  const nextRunAt = nextDigestRunAt(input, member.household.timezone, new Date());
  // Explicit null, not omitted — switching frequency away from "weekly"
  // must clear a stale dayOfWeek, not leave a previous value in place.
  const data = { frequency: input.frequency, dayOfWeek: input.dayOfWeek ?? null, timeOfDay: input.timeOfDay, nextRunAt };

  await prisma.digestSubscription.upsert({
    where: { memberId: member.id, householdId: member.householdId },
    create: { householdId: member.householdId, memberId: member.id, ...data },
    update: data,
  });

  revalidatePath("/settings/notifications");
}
