import { describe, expect, it } from "vitest";
import {
  startOfHouseholdDay,
  endOfHouseholdDay,
  formatInHouseholdTimezone,
  isTodayInHouseholdTimezone,
  nextDigestRunAt,
} from "./dates";

describe("startOfHouseholdDay / endOfHouseholdDay", () => {
  it("computes midnight boundaries in the given timezone, not UTC", () => {
    // 2026-07-24T23:30:00Z is already 2026-07-25 local in a UTC+2 zone.
    const asOf = new Date("2026-07-24T23:30:00.000Z");

    const start = startOfHouseholdDay("Europe/Sarajevo", asOf); // UTC+2 in July (CEST)
    const end = endOfHouseholdDay("Europe/Sarajevo", asOf);

    expect(start.getTime()).toBe(new Date("2026-07-24T22:00:00.000Z").getTime()); // 2026-07-25T00:00:00+02:00
    expect(end.getTime()).toBe(new Date("2026-07-25T21:59:59.999Z").getTime()); // 2026-07-25T23:59:59.999+02:00
  });

  it("gives a different boundary for a UTC household on the same instant", () => {
    const asOf = new Date("2026-07-24T23:30:00.000Z");

    const start = startOfHouseholdDay("UTC", asOf);

    expect(start.getTime()).toBe(new Date("2026-07-24T00:00:00.000Z").getTime());
  });
});

describe("formatInHouseholdTimezone", () => {
  it("formats a date using the household's own timezone, not the runtime's", () => {
    // 2026-07-24T23:30:00Z is already 2026-07-25 local in a UTC+2 zone.
    const at = new Date("2026-07-24T23:30:00.000Z");

    expect(formatInHouseholdTimezone(at, "Europe/Sarajevo", "yyyy-MM-dd")).toBe("2026-07-25");
    expect(formatInHouseholdTimezone(at, "UTC", "yyyy-MM-dd")).toBe("2026-07-24");
  });
});

describe("isTodayInHouseholdTimezone", () => {
  it("agrees with the household's own calendar day, not the runtime's", () => {
    // Same instant, two households disagree on what day it is.
    const asOf = new Date("2026-07-24T23:30:00.000Z");
    const july24Noon = new Date("2026-07-24T12:00:00.000Z");
    const july25Noon = new Date("2026-07-25T12:00:00.000Z");

    expect(isTodayInHouseholdTimezone(july25Noon, "Europe/Sarajevo", asOf)).toBe(true); // it's already the 25th there
    expect(isTodayInHouseholdTimezone(july24Noon, "Europe/Sarajevo", asOf)).toBe(false);
    expect(isTodayInHouseholdTimezone(july24Noon, "UTC", asOf)).toBe(true); // still the 24th in UTC
    expect(isTodayInHouseholdTimezone(july25Noon, "UTC", asOf)).toBe(false);
  });
});

describe("nextDigestRunAt", () => {
  it("returns null when frequency is off", () => {
    const from = new Date("2026-07-24T12:00:00.000Z");
    expect(nextDigestRunAt({ frequency: "off", timeOfDay: "07:00" }, "UTC", from)).toBeNull();
  });

  it("schedules a daily digest for the same day if timeOfDay hasn't passed yet", () => {
    const from = new Date("2026-07-24T05:00:00.000Z"); // 05:00 UTC
    const next = nextDigestRunAt({ frequency: "daily", timeOfDay: "07:00" }, "UTC", from);
    expect(next?.getTime()).toBe(new Date("2026-07-24T07:00:00.000Z").getTime());
  });

  it("rolls a daily digest to the next day once timeOfDay has already passed", () => {
    const from = new Date("2026-07-24T09:00:00.000Z"); // 09:00 UTC, past 07:00
    const next = nextDigestRunAt({ frequency: "daily", timeOfDay: "07:00" }, "UTC", from);
    expect(next?.getTime()).toBe(new Date("2026-07-25T07:00:00.000Z").getTime());
  });

  it("computes timeOfDay in the household's own timezone, not UTC", () => {
    const from = new Date("2026-07-24T04:00:00.000Z"); // 06:00 in Europe/Sarajevo (UTC+2)
    const next = nextDigestRunAt({ frequency: "daily", timeOfDay: "07:00" }, "Europe/Sarajevo", from);
    expect(next?.getTime()).toBe(new Date("2026-07-24T05:00:00.000Z").getTime()); // 07:00+02:00
  });

  it("advances a weekly digest to the next matching dayOfWeek", () => {
    const from = new Date("2026-07-24T12:00:00.000Z"); // Friday
    const next = nextDigestRunAt({ frequency: "weekly", dayOfWeek: "monday", timeOfDay: "07:00" }, "UTC", from);
    expect(next?.getTime()).toBe(new Date("2026-07-27T07:00:00.000Z").getTime()); // following Monday
  });
});
