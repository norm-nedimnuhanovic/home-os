import type { ActingMember } from "@/lib/auth/session";
import { startOfHouseholdDay, endOfHouseholdDay } from "@/lib/dates";
import { getVisibleTasks } from "@/modules/tasks";
import { getCalendarRange } from "@/modules/calendar";
import { getUpcomingSubscriptions } from "@/modules/finance";
import { getActiveReminderOccurrences } from "@/modules/reminders";
import type { DashboardItem } from "../entities/dashboard-item";

const BILL_LOOKAHEAD_DAYS = 7; // fixed, not per-member configurable — plan.md §9 Q32

// Composes four independently-queried, independently-visibility-scoped
// lists into the one common projection every "Today" row shares (plan.md
// §4.1). Every "today" boundary is computed from the household's own
// timezone (Household.timezone), never the server's or browser's local
// zone — a household member traveling, or a serverless function running
// in UTC, must never shift what counts as "today."
export async function getTodayView(actingMember: ActingMember, householdTimezone: string): Promise<DashboardItem[]> {
  const now = new Date();
  const startOfToday = startOfHouseholdDay(householdTimezone, now);
  const endOfToday = endOfHouseholdDay(householdTimezone, now);

  const [tasks, calendar, bills, reminderOccurrences] = await Promise.all([
    getVisibleTasks(actingMember, { completed: false, dueBefore: endOfToday }),
    getCalendarRange(actingMember, startOfToday, endOfToday),
    getUpcomingSubscriptions(actingMember.householdId, BILL_LOOKAHEAD_DAYS, now),
    getActiveReminderOccurrences(actingMember.householdId, actingMember.id),
  ]);

  const items: DashboardItem[] = [
    ...tasks.map((task): DashboardItem => ({
      kind: "task",
      sourceModule: "tasks",
      entityType: "Task",
      entityId: task.id,
      title: task.title,
      at: task.dueDate!,
      href: "/tasks",
      memberName: task.assignee?.displayName,
      badge: task.dueDate! < startOfToday ? "Overdue" : undefined,
      overdue: task.dueDate! < startOfToday,
    })),
    ...calendar.events.map((event): DashboardItem => ({
      kind: "event",
      sourceModule: "calendar",
      entityType: "Event",
      entityId: event.id,
      title: event.title,
      at: event.startAt,
      href: "/calendar",
    })),
    ...bills.map((bill): DashboardItem => ({
      kind: "bill",
      sourceModule: "finance",
      entityType: "Subscription",
      entityId: bill.id,
      title: bill.name,
      at: bill.nextDueDate,
      href: "/finance/subscriptions",
      memberName: bill.responsibleMember.displayName,
      // Day-boundary, same as Task — a bill due "today" isn't overdue
      // just because the exact stored instant already passed (e.g. a
      // subscription created with today's exact current moment as its
      // nextDueDate default). Bills are day-granularity, never
      // second-granularity — matches Task's own dueDate < startOfToday
      // check, a real bug caught via browser testing (a same-day bill
      // showed "Overdue" almost immediately when compared against `now`).
      badge: bill.nextDueDate < startOfToday ? "Overdue" : undefined,
      overdue: bill.nextDueDate < startOfToday,
    })),
    ...reminderOccurrences.map((occurrence): DashboardItem => ({
      kind: "reminder",
      sourceModule: "reminders",
      entityType: "Reminder",
      entityId: occurrence.reminderId,
      title: occurrence.reminder.title,
      at: occurrence.remindAt,
      href: "/reminders",
      // Instant-based, deliberately NOT day-boundary — matches Reminders'
      // own established getOccurrenceStatus() "due" semantics: a reminder
      // set for a specific moment is legitimately due once that moment
      // passes, not merely "later today." Bills and Reminders are
      // different concepts even though both render in this same merged
      // list — don't force them onto one shared rule.
      badge: occurrence.status === "snoozed" ? "Snoozed" : occurrence.remindAt < now ? "Due" : undefined,
      overdue: occurrence.status !== "snoozed" && occurrence.remindAt < now,
    })),
  ];

  // Overdue-first, then chronological — matches Tasks' own getTaskStatus()
  // ordering convention extended across every source. Every item built
  // above always sets `at` — the field is only optional for search results
  // (entities/dashboard-item.ts), never for a Today row.
  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.at!.getTime() - b.at!.getTime();
  });
}
