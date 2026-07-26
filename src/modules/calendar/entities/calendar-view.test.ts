import { describe, expect, it } from "vitest";
import { getViewRange, getAdjacentDate, isCalendarViewType } from "./calendar-view";

describe("getViewRange", () => {
  it("month view spans full weeks around the month's first/last day", () => {
    const { from, to } = getViewRange("month", new Date("2026-08-15"));
    // August 2026 starts on a Saturday and ends on a Monday — the padded
    // grid should start on the Sunday before and end on the Saturday after.
    expect(from.getDay()).toBe(0);
    expect(to.getDay()).toBe(6);
    expect(from <= new Date("2026-08-01")).toBe(true);
    expect(to >= new Date("2026-08-31")).toBe(true);
  });

  it("week view spans exactly one week", () => {
    const { from, to } = getViewRange("week", new Date("2026-08-15"));
    expect(from.getDay()).toBe(0);
    expect(to.getDay()).toBe(6);
  });

  it("day view spans just the given day", () => {
    const { from, to } = getViewRange("day", new Date("2026-08-15T10:00:00"));
    expect(from.getDate()).toBe(15);
    expect(to.getDate()).toBe(15);
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
  });
});

describe("getAdjacentDate", () => {
  it("moves by one month for month view", () => {
    const next = getAdjacentDate("month", new Date("2026-08-15"), 1);
    expect(next.getMonth()).toBe(8); // September
  });

  it("moves by one week for week view", () => {
    const next = getAdjacentDate("week", new Date("2026-08-15"), 1);
    expect(next.getDate()).toBe(22);
  });

  it("moves by one day for day view, in either direction", () => {
    expect(getAdjacentDate("day", new Date("2026-08-15"), 1).getDate()).toBe(16);
    expect(getAdjacentDate("day", new Date("2026-08-15"), -1).getDate()).toBe(14);
  });
});

describe("isCalendarViewType", () => {
  it("accepts the three valid views", () => {
    expect(isCalendarViewType("month")).toBe(true);
    expect(isCalendarViewType("week")).toBe(true);
    expect(isCalendarViewType("day")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCalendarViewType("year")).toBe(false);
  });
});
