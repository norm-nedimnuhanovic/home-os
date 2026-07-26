import Link from "next/link";
import { format, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { isTodayInHouseholdTimezone } from "@/lib/dates";
import { CalendarItemChip } from "./calendar-item-chip";
import { groupItemsByDay, dayKey, type CalendarItem } from "../entities/calendar-item";

export function WeekView({
  from,
  to,
  items,
  onItemClick,
  householdTimezone,
}: {
  from: Date;
  to: Date;
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  householdTimezone: string;
}) {
  const days = eachDayOfInterval({ start: from, end: to });
  const grouped = groupItemsByDay(items);

  return (
    <div className="grid grid-cols-1 gap-2 overflow-x-auto sm:grid-cols-7">
      {days.map((day) => {
        const key = dayKey(day);
        const dayItems = grouped.get(key) ?? [];
        return (
          <div key={key} className="flex min-w-0 flex-col gap-1 rounded-lg border p-2">
            <Link
              href={`/calendar?view=day&date=${key}`}
              className="flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  isTodayInHouseholdTimezone(day, householdTimezone) && "bg-primary text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {format(day, "EEE")}
            </Link>
            <div className="flex flex-col gap-1">
              {dayItems.length === 0 && <p className="text-xs text-muted-foreground">Nothing scheduled</p>}
              {dayItems.map((item) => (
                <CalendarItemChip key={item.id} item={item} onClick={() => onItemClick(item)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
