import { describe, expect, it } from "vitest";
import { computeEqualSplits, splitsSumMatches } from "./split";

describe("computeEqualSplits", () => {
  it("divides evenly when the amount splits cleanly", () => {
    const result = computeEqualSplits(30, ["m1", "m2", "m3"]);
    expect(result).toEqual([
      { memberId: "m1", amount: 10 },
      { memberId: "m2", amount: 10 },
      { memberId: "m3", amount: 10 },
    ]);
  });

  it("gives the remainder cent(s) to the first member(s), summing to exactly the total", () => {
    const result = computeEqualSplits(10, ["m1", "m2", "m3"]);
    const sum = result.reduce((acc, s) => acc + s.amount, 0);
    expect(Math.round(sum * 100)).toBe(1000);
    expect(result[0].amount).toBeGreaterThan(result[2].amount);
  });
});

describe("splitsSumMatches", () => {
  it("returns true when splits sum to the transaction amount", () => {
    expect(splitsSumMatches(100, [{ amount: 40 }, { amount: 60 }])).toBe(true);
  });

  it("returns false when splits don't sum to the transaction amount", () => {
    expect(splitsSumMatches(100, [{ amount: 40 }, { amount: 50 }])).toBe(false);
  });

  it("is precise to the cent, not fooled by floating point drift", () => {
    expect(splitsSumMatches(10, [{ amount: 3.33 }, { amount: 3.33 }, { amount: 3.34 }])).toBe(true);
  });
});
