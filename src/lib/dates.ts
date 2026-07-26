import { TZDate } from "@date-fns/tz";
import { startOfDay, endOfDay, format, isSameDay, addDays } from "date-fns";
import type { DayOfWeek } from "@prisma/client";

// "Today" boundaries always compute from Household.timezone, never the
// browser's local timezone — a household member traveling, or Vercel's
// serverless functions running in UTC, must never shift what counts as
// "today" for Dashboard/Calendar (plan.md §4.1). TZDate overrides Date's
// getters to reflect the given zone, so startOfDay/endOfDay from date-fns
// compute midnight boundaries correctly in that zone while still producing
// a real Date instance any Prisma gte/lte comparison accepts.
export function startOfHouseholdDay(timezone: string, asOf: Date = new Date()): Date {
  return startOfDay(new TZDate(asOf, timezone));
}

export function endOfHouseholdDay(timezone: string, asOf: Date = new Date()): Date {
  return endOfDay(new TZDate(asOf, timezone));
}

// Formatting a date with no explicit timezone (`date.toLocaleString()`,
// `new Date(x).toLocaleDateString()`) silently depends on whichever
// runtime renders it — the server's host OS timezone for the first
// render, the browser's local timezone for a Client Component's
// hydration/re-render — and neither one is guaranteed to match
// Household.timezone. That mismatch is a real bug this project hit twice
// during Dashboard's own browser verification: a Server Component
// (Dashboard's TodayList) showing a date a full calendar day off from the
// household's actual "today," and a Client Component (TaskList) hydration-
// mismatching because the server and the browser disagreed on what
// "today" even meant. Always format a date for display via this function,
// with the household's own timezone, never a bare `.toLocaleString()`.
export function formatInHouseholdTimezone(date: Date, timezone: string, formatStr = "PP"): string {
  return format(new TZDate(date, timezone), formatStr);
}

// Same reasoning as formatInHouseholdTimezone: date-fns' own isToday()
// compares against a bare `new Date()`, so a Client Component calling it
// directly (Calendar's MonthView/WeekView, both rendered inside the
// "use client" CalendarShell) hydration-mismatches whenever the server's
// host timezone and the browser's local timezone disagree on the current
// date — neither of which is Household.timezone anyway.
export function isTodayInHouseholdTimezone(day: Date, timezone: string, asOf: Date = new Date()): boolean {
  return isSameDay(new TZDate(day, timezone), new TZDate(asOf, timezone));
}

const DAYS_OF_WEEK: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// DigestSubscription's own "when is 'now' in this household" math
// (docs/email.md §8) — centralized here alongside the other household-
// timezone helpers rather than left to sendDueDigests()'s own arithmetic.
export function nextDigestRunAt(
  sub: { frequency: "off" | "daily" | "weekly"; dayOfWeek?: DayOfWeek | null; timeOfDay: string },
  timezone: string,
  from: Date,
): Date | null {
  if (sub.frequency === "off") return null;

  const [hour, minute] = sub.timeOfDay.split(":").map(Number);
  let candidate = new TZDate(from, timezone);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate <= from) candidate = addDays(candidate, 1);

  if (sub.frequency === "weekly" && sub.dayOfWeek) {
    while (DAYS_OF_WEEK[candidate.getDay()] !== sub.dayOfWeek) {
      candidate = addDays(candidate, 1);
    }
  }
  return candidate;
}
