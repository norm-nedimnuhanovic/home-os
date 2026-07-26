import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
} from "date-fns";

export const CALENDAR_VIEWS = ["month", "week", "day"] as const;
export type CalendarViewType = (typeof CALENDAR_VIEWS)[number];

export function isCalendarViewType(value: string): value is CalendarViewType {
  return (CALENDAR_VIEWS as readonly string[]).includes(value);
}

// Month view pads out to full weeks (docs' month-grid convention) so the
// first/last row isn't a partial week; week/day views are exact.
export function getViewRange(view: CalendarViewType, date: Date): { from: Date; to: Date } {
  if (view === "month") {
    return { from: startOfWeek(startOfMonth(date)), to: endOfWeek(endOfMonth(date)) };
  }
  if (view === "week") {
    return { from: startOfWeek(date), to: endOfWeek(date) };
  }
  return { from: startOfDay(date), to: endOfDay(date) };
}

export function getAdjacentDate(view: CalendarViewType, date: Date, direction: 1 | -1): Date {
  if (view === "month") return addMonths(date, direction);
  if (view === "week") return addWeeks(date, direction);
  return addDays(date, direction);
}
