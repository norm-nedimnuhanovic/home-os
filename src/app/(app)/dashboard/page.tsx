import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getTodayView } from "@/modules/dashboard";
import { TodayList } from "@/modules/dashboard/components/today-list";

export default async function DashboardPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  // "Today" boundaries always compute from the household's own timezone
  // (plan.md §4.1), never the server's/browser's — member.household is
  // already joined onto the acting member by requireMember() itself.
  const items = await getTodayView(member, member.household.timezone);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Today</h1>
      <TodayList items={items} householdTimezone={member.household.timezone} />
    </div>
  );
}
