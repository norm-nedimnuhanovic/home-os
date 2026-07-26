import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getNotificationCategories, getDigestSubscription } from "@/lib/notifications/queries/get-preferences";
import { SettingsNav } from "../settings-nav";
import { NotificationPreferencesForm } from "./notification-preferences-form";
import { DigestSettingsForm } from "./digest-settings-form";

export default async function NotificationsSettingsPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [categories, digestSubscription] = await Promise.all([
    getNotificationCategories(member.householdId, member.id),
    getDigestSubscription(member.householdId, member.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsNav active="notifications" />
      <div className="flex flex-col gap-6">
        <NotificationPreferencesForm categories={categories} />
        <DigestSettingsForm digestSubscription={digestSubscription} />
      </div>
    </div>
  );
}
