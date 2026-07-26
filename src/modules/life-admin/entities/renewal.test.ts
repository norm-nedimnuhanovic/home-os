import { describe, expect, it } from "vitest";
import { getRenewalLifecycleStatus } from "./renewal";

const asOf = new Date("2026-07-01T00:00:00.000Z");

describe("getRenewalLifecycleStatus", () => {
  it("returns 'active' when well outside every reminder window", () => {
    const expiryDate = new Date("2026-12-01T00:00:00.000Z");
    expect(getRenewalLifecycleStatus({ expiryDate, reminderOffsetsDays: [30], status: "active" }, asOf)).toBe(
      "active",
    );
  });

  it("returns 'expiring_soon' once inside the earliest reminderOffsetsDays window", () => {
    const expiryDate = new Date("2026-07-20T00:00:00.000Z"); // 19 days out, offset window is 30
    expect(getRenewalLifecycleStatus({ expiryDate, reminderOffsetsDays: [30], status: "active" }, asOf)).toBe(
      "expiring_soon",
    );
  });

  it("uses the earliest of multiple offsets for the window boundary", () => {
    const expiryDate = new Date("2026-07-10T00:00:00.000Z"); // 9 days out
    expect(getRenewalLifecycleStatus({ expiryDate, reminderOffsetsDays: [7, 60], status: "active" }, asOf)).toBe(
      "active",
    ); // only the 7-day window would trigger, and we're not inside it yet
  });

  it("returns 'expired' once past the expiry date", () => {
    const expiryDate = new Date("2026-06-01T00:00:00.000Z");
    expect(getRenewalLifecycleStatus({ expiryDate, reminderOffsetsDays: [30], status: "active" }, asOf)).toBe(
      "expired",
    );
  });

  it("passes through terminal statuses (renewed/cancelled) unchanged regardless of dates", () => {
    const expiryDate = new Date("2026-01-01T00:00:00.000Z"); // long past
    expect(getRenewalLifecycleStatus({ expiryDate, reminderOffsetsDays: [30], status: "renewed" }, asOf)).toBe(
      "renewed",
    );
    expect(getRenewalLifecycleStatus({ expiryDate, reminderOffsetsDays: [30], status: "cancelled" }, asOf)).toBe(
      "cancelled",
    );
  });
});
