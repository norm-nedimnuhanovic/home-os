import { describe, expect, it } from "vitest";
import { createSubscriptionInputSchema, computeNextDueDate } from "./subscription";

const base = {
  name: "Netflix",
  categoryId: "ccategory0000000000001",
  amount: 15,
  startDate: new Date("2026-08-01"),
  responsibleMemberId: "cmember0000000000001",
};

describe("createSubscriptionInputSchema", () => {
  it("accepts a valid monthly subscription", () => {
    expect(createSubscriptionInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects frequency=custom with no customIntervalDays", () => {
    const result = createSubscriptionInputSchema.safeParse({ ...base, frequency: "custom" });
    expect(result.success).toBe(false);
  });

  it("accepts frequency=custom with customIntervalDays set", () => {
    const result = createSubscriptionInputSchema.safeParse({
      ...base,
      frequency: "custom",
      customIntervalDays: 45,
    });
    expect(result.success).toBe(true);
  });
});

describe("computeNextDueDate", () => {
  it("advances by one month for monthly", () => {
    const next = computeNextDueDate(new Date("2026-08-01"), "monthly");
    expect(next.getMonth()).toBe(8); // September
  });

  it("advances by the custom interval for custom frequency", () => {
    const next = computeNextDueDate(new Date("2026-08-01"), "custom", 10);
    expect(next.getDate()).toBe(11);
  });
});
