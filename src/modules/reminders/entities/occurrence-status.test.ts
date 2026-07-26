import { describe, expect, it } from "vitest";
import { getOccurrenceStatus } from "./occurrence-status";

describe("getOccurrenceStatus", () => {
  it("returns 'due' for a pending occurrence whose remindAt has passed", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(getOccurrenceStatus({ status: "pending", remindAt: yesterday })).toBe("due");
  });

  it("returns 'upcoming' for a pending occurrence in the future", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(getOccurrenceStatus({ status: "pending", remindAt: tomorrow })).toBe("upcoming");
  });

  it("passes through terminal statuses unchanged", () => {
    const now = new Date();
    expect(getOccurrenceStatus({ status: "snoozed", remindAt: now })).toBe("snoozed");
    expect(getOccurrenceStatus({ status: "dismissed", remindAt: now })).toBe("dismissed");
    expect(getOccurrenceStatus({ status: "completed", remindAt: now })).toBe("completed");
    expect(getOccurrenceStatus({ status: "missed", remindAt: now })).toBe("missed");
  });
});
