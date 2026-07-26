import Link from "next/link";
import { format, eachDayOfInterval, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { isTodayInHouseholdTimezone } from "@/lib/dates";
import { CalendarItemChip } from "./calendar-item-chip";
import { groupItemsByDay, dayKey, type CalendarItem } from "../entities/calendar-item";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

export function MonthView({
  month,
  from,
  to,
  items,
  onItemClick,
  householdTimezone,
}: {
  month: Date;
  from: Date;
  to: Date;
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  householdTimezone: string;
}) {
  const days = eachDayOfInterval({ start: from, end: to });
  const grouped = groupItemsByDay(items);

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="bg-muted p-1 text-center font-medium">
          {label}
        </div>
      ))}
      {days.map((day) => {
        const key = dayKey(day);
        const dayItems = grouped.get(key) ?? [];
        return (
          <div
            key={key}
            className={cn(
              "min-h-20 bg-background p-1 sm:min-h-24",
              !isSameMonth(day, month) && "opacity-40",
            )}
          >
            <Link
              href={`/calendar?view=day&date=${key}`}
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs hover:bg-muted",
                isTodayInHouseholdTimezone(day, householdTimezone) && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {format(day, "d")}
            </Link>
            <div className="mt-1 flex flex-col gap-0.5">
              {dayItems.slice(0, MAX_VISIBLE_PER_DAY).map((item) => (
                <CalendarItemChip key={item.id} item={item} onClick={() => onItemClick(item)} />
              ))}
              {dayItems.length > MAX_VISIBLE_PER_DAY && (
                <Link
                  href={`/calendar?view=day&date=${key}`}
                  className="text-[10px] text-muted-foreground hover:underline"
                >
                  +{dayItems.length - MAX_VISIBLE_PER_DAY} more
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
