import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTodayView } from "./get-today-view";
import { getVisibleTasks } from "@/modules/tasks";
import { getCalendarRange } from "@/modules/calendar";
import { getUpcomingSubscriptions } from "@/modules/finance";
import { getActiveReminderOccurrences } from "@/modules/reminders";

vi.mock("@/modules/tasks", () => ({ getVisibleTasks: vi.fn() }));
vi.mock("@/modules/calendar", () => ({ getCalendarRange: vi.fn() }));
vi.mock("@/modules/finance", () => ({ getUpcomingSubscriptions: vi.fn() }));
vi.mock("@/modules/reminders", () => ({ getActiveReminderOccurrences: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getTodayView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges all four sources into the common projection, overdue-first then chronological", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const laterToday = new Date(now.getTime() + 60 * 60 * 1000);

    vi.mocked(getVisibleTasks).mockResolvedValue([
      { id: "task_1", title: "Overdue task", dueDate: yesterday, assignee: { displayName: "Sam" } },
    ] as never);
    vi.mocked(getCalendarRange).mockResolvedValue({
      events: [{ id: "event_1", title: "Team sync", startAt: laterToday }],
      tasks: [],
    } as never);
    vi.mocked(getUpcomingSubscriptions).mockResolvedValue([
      { id: "sub_1", name: "Internet", nextDueDate: laterToday, responsibleMember: { displayName: "Sam" } },
    ] as never);
    vi.mocked(getActiveReminderOccurrences).mockResolvedValue([
      { id: "occ_1", reminderId: "reminder_1", remindAt: laterToday, status: "pending", reminder: { title: "Water plants" } },
    ] as never);

    const result = await getTodayView(actingMember as never, "UTC");

    expect(result).toHaveLength(4);
    expect(result[0].title).toBe("Overdue task"); // overdue sorts first regardless of chronological position
    expect(result[0].overdue).toBe(true);
    expect(result[0].kind).toBe("task");
  });

  it("does not mark a bill due earlier today as overdue just because that instant already passed", async () => {
    const now = new Date();
    const earlierToday = new Date(now);
    earlierToday.setUTCHours(0, 0, 1, 0); // just after UTC midnight — earlier than "now" but still "today" in the UTC household

    vi.mocked(getVisibleTasks).mockResolvedValue([]);
    vi.mocked(getCalendarRange).mockResolvedValue({ events: [], tasks: [] } as never);
    vi.mocked(getUpcomingSubscriptions).mockResolvedValue([
      { id: "sub_1", name: "Internet", nextDueDate: earlierToday, responsibleMember: { displayName: "Sam" } },
    ] as never);
    vi.mocked(getActiveReminderOccurrences).mockResolvedValue([]);

    const result = await getTodayView(actingMember as never, "UTC");

    expect(result).toHaveLength(1);
    expect(result[0].overdue).toBe(false);
    expect(result[0].badge).toBeUndefined();
  });

  it("passes the household-timezone-derived end-of-today boundary to getVisibleTasks", async () => {
    vi.mocked(getVisibleTasks).mockResolvedValue([]);
    vi.mocked(getCalendarRange).mockResolvedValue({ events: [], tasks: [] } as never);
    vi.mocked(getUpcomingSubscriptions).mockResolvedValue([]);
    vi.mocked(getActiveReminderOccurrences).mockResolvedValue([]);

    await getTodayView(actingMember as never, "UTC");

    expect(getVisibleTasks).toHaveBeenCalledWith(actingMember, { completed: false, dueBefore: expect.any(Date) });
  });
});
