import { describe, expect, it } from "vitest";
import { createBudgetInputSchema, getCurrentPeriodRange } from "./budget";

describe("createBudgetInputSchema", () => {
  it("accepts a valid whole-household budget (no memberId)", () => {
    const result = createBudgetInputSchema.safeParse({
      categoryId: "ccategory0000000000001",
      amount: 500,
      effectiveFrom: new Date("2026-08-01"),
    });
    expect(result.success).toBe(true);
  });

  it("defaults period to monthly, alertThresholdPercent to 80, alertOnExceeded to true", () => {
    const result = createBudgetInputSchema.parse({
      categoryId: "ccategory0000000000001",
      amount: 500,
      effectiveFrom: new Date("2026-08-01"),
    });
    expect(result.period).toBe("monthly");
    expect(result.alertThresholdPercent).toBe(80);
    expect(result.alertOnExceeded).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    const result = createBudgetInputSchema.safeParse({
      categoryId: "ccategory0000000000001",
      amount: 0,
      effectiveFrom: new Date("2026-08-01"),
    });
    expect(result.success).toBe(false);
  });
});

describe("getCurrentPeriodRange", () => {
  it("returns a full calendar month for period=monthly", () => {
    const { start, end } = getCurrentPeriodRange("monthly", new Date("2026-08-15"));
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(7); // August (0-indexed)
  });

  it("returns a full calendar year for period=yearly", () => {
    const { start, end } = getCurrentPeriodRange("yearly", new Date("2026-08-15"));
    expect(start.getMonth()).toBe(0);
    expect(end.getMonth()).toBe(11);
  });
});
