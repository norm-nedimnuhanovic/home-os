import { redirect } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { getCalendarRange } from "@/modules/calendar";
import { getViewRange, isCalendarViewType, type CalendarViewType } from "@/modules/calendar/entities/calendar-view";
import { toCalendarItems } from "@/modules/calendar/entities/calendar-item";
import { getMembers } from "@/lib/household";
import { requireMember } from "@/lib/auth/session";
import { CalendarNav } from "@/modules/calendar/components/calendar-nav";
import { CalendarShell } from "@/modules/calendar/components/calendar-shell";
import { NewEventDialog } from "@/modules/calendar/components/new-event-dialog";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const member = await requireMember();
  if (!member) redirect("/login");

  const params = await searchParams;
  const view: CalendarViewType = params.view && isCalendarViewType(params.view) ? params.view : "month";
  // No ?date= param means "today" — that must be the household's today, not
  // the server host's (a bug caught during Dashboard's own browser
  // verification: date-fns' month/week boundary math reads whichever
  // Date's own getters it's given, so a plain `new Date()` here computed
  // "today" in the server's timezone instead of Household.timezone).
  const date = params.date && !Number.isNaN(Date.parse(params.date))
    ? new Date(params.date)
    : new TZDate(new Date(), member.household.timezone);

  const { from, to } = getViewRange(view, date);
  const [{ events, tasks }, members] = await Promise.all([
    getCalendarRange(member, from, to),
    getMembers(member.householdId),
  ]);
  const items = toCalendarItems(events, tasks);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <NewEventDialog defaultDate={date} members={members} />
      </div>
      <CalendarNav view={view} date={date} />
      <CalendarShell
        view={view}
        month={date}
        from={from}
        to={to}
        items={items}
        events={events}
        members={members}
        memberId={member.id}
        householdTimezone={member.household.timezone}
      />
    </div>
  );
}
