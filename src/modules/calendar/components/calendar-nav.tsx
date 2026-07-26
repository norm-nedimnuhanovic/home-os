import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { getAdjacentDate, CALENDAR_VIEWS, type CalendarViewType } from "../entities/calendar-view";

const VIEW_LABEL: Record<CalendarViewType, string> = { month: "Month", week: "Week", day: "Day" };

function href(view: CalendarViewType, date: Date) {
  return `/calendar?view=${view}&date=${format(date, "yyyy-MM-dd")}`;
}

export function CalendarNav({ view, date }: { view: CalendarViewType; date: Date }) {
  const prev = getAdjacentDate(view, date, -1);
  const next = getAdjacentDate(view, date, 1);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={href(view, prev)}>Prev</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href(view, new Date())}>Today</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href(view, next)}>Next</Link>
        </Button>
        <span className="text-sm font-medium">
          {format(date, view === "month" ? "MMMM yyyy" : "PPP")}
        </span>
      </div>
      <div className="flex gap-1">
        {CALENDAR_VIEWS.map((v) => (
          <Button key={v} asChild variant={v === view ? "default" : "outline"} size="sm">
            <Link href={href(v, date)}>{VIEW_LABEL[v]}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
