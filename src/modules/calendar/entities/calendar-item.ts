import { format } from "date-fns";
import type { Event, Task } from "@prisma/client";

export type CalendarItem = {
  id: string;
  title: string;
  kind: "event" | "task";
  startAt: Date;
  allDay: boolean;
  color: string | null;
  completed: boolean;
};

export function toCalendarItems(
  events: Event[],
  tasks: (Task & { assignee?: { displayName: string } | null })[],
): CalendarItem[] {
  const eventItems: CalendarItem[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    kind: "event",
    startAt: e.startAt,
    allDay: e.allDay,
    color: e.color,
    completed: false,
  }));

  const taskItems: CalendarItem[] = tasks
    .filter((t): t is typeof t & { dueDate: Date } => t.dueDate !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      kind: "task",
      startAt: t.dueDate,
      allDay: t.dueDateAllDay,
      color: null,
      completed: t.completedAt !== null,
    }));

  return [...eventItems, ...taskItems].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

const DAY_KEY_FORMAT = "yyyy-MM-dd";

export function groupItemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = format(item.startAt, DAY_KEY_FORMAT);
    const existing = map.get(key);
    if (existing) existing.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function dayKey(date: Date): string {
  return format(date, DAY_KEY_FORMAT);
}
