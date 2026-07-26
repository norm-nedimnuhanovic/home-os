import { requireMember } from "@/lib/auth/session";
import { getInbox } from "@/lib/notifications/queries/get-inbox";
import { NotificationBellButton } from "./notification-bell-button";

// Server Component wrapper, same shape as Nav (fetches, hands off to a
// Client Component for the interactive popover) — requireMember() is
// React cache()-wrapped so calling it again here (layout.tsx already did)
// costs nothing extra.
export async function NotificationBell() {
  const member = await requireMember();
  if (!member) return null;

  const items = await getInbox(member);
  return <NotificationBellButton items={items} />;
}
