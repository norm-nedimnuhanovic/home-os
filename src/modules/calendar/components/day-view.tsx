import { format } from "date-fns";
import { CalendarItemChip } from "./calendar-item-chip";
import { groupItemsByDay, dayKey, type CalendarItem } from "../entities/calendar-item";

export function DayView({
  date,
  items,
  onItemClick,
}: {
  date: Date;
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
}) {
  const dayItems = groupItemsByDay(items).get(dayKey(date)) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{format(date, "EEEE, MMMM d")}</h2>
      {dayItems.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing scheduled for this day.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {dayItems.map((item) => (
          <div key={item.id} className="rounded-lg border p-2">
            <CalendarItemChip item={item} onClick={() => onItemClick(item)} />
            {!item.allDay && (
              <p className="mt-1 px-1.5 text-xs text-muted-foreground">{format(item.startAt, "p")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
