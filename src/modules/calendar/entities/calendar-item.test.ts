import { describe, expect, it } from "vitest";
import { toCalendarItems, groupItemsByDay, dayKey } from "./calendar-item";

describe("toCalendarItems", () => {
  it("merges events and tasks into one sorted list", () => {
    const events = [
      { id: "e1", title: "Dentist", startAt: new Date("2026-08-02T10:00:00"), allDay: false, color: "#fff" },
    ] as never[];
    const tasks = [
      { id: "t1", title: "Buy milk", dueDate: new Date("2026-08-01T00:00:00"), dueDateAllDay: true, completedAt: null },
    ] as never[];

    const result = toCalendarItems(events, tasks);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("t1"); // earlier date sorts first
    expect(result[1].id).toBe("e1");
  });

  it("excludes tasks with no dueDate", () => {
    const tasks = [{ id: "t1", title: "No due date", dueDate: null, dueDateAllDay: true, completedAt: null }] as never[];

    expect(toCalendarItems([], tasks)).toHaveLength(0);
  });

  it("marks a task item completed based on completedAt", () => {
    const tasks = [
      { id: "t1", title: "Done", dueDate: new Date("2026-08-01"), dueDateAllDay: true, completedAt: new Date() },
    ] as never[];

    expect(toCalendarItems([], tasks)[0].completed).toBe(true);
  });
});

describe("groupItemsByDay", () => {
  it("groups items sharing the same calendar day", () => {
    const items = [
      { id: "a", title: "A", kind: "event" as const, startAt: new Date("2026-08-01T08:00:00"), allDay: false, color: null, completed: false },
      { id: "b", title: "B", kind: "event" as const, startAt: new Date("2026-08-01T20:00:00"), allDay: false, color: null, completed: false },
      { id: "c", title: "C", kind: "task" as const, startAt: new Date("2026-08-02T00:00:00"), allDay: true, completed: false, color: null },
    ];

    const grouped = groupItemsByDay(items);

    expect(grouped.get(dayKey(new Date("2026-08-01")))).toHaveLength(2);
    expect(grouped.get(dayKey(new Date("2026-08-02")))).toHaveLength(1);
  });
});
