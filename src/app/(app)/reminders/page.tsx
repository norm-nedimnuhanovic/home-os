import { redirect } from "next/navigation";
import { getVisibleReminders } from "@/modules/reminders";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { ReminderList } from "@/modules/reminders/components/reminder-list";
import { NewReminderDialog } from "@/modules/reminders/components/new-reminder-dialog";

export default async function RemindersPage() {
  const member = await requireMember();
  if (!member) redirect("/login");

  const [reminders, members] = await Promise.all([
    getVisibleReminders(member),
    getMembers(member.householdId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <NewReminderDialog members={members} />
      </div>
      <ReminderList reminders={reminders} actingMemberId={member.id} />
    </div>
  );
}
