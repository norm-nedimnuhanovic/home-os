import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { convertDecimals } from "./decimal-serialize";

describe("convertDecimals", () => {
  it("converts a top-level Decimal to a plain number", () => {
    expect(convertDecimals(new Prisma.Decimal("12.50"))).toBe(12.5);
  });

  it("converts Decimal fields nested inside an object", () => {
    const result = convertDecimals({ id: "t1", amount: new Prisma.Decimal("50.00") }) as {
      amount: unknown;
    };
    expect(result.amount).toBe(50);
    expect(typeof result.amount).toBe("number");
  });

  it("converts Decimal fields inside an array of rows, including nested relations", () => {
    const result = convertDecimals([
      { id: "t1", amount: new Prisma.Decimal("10"), splits: [{ shareAmount: new Prisma.Decimal("5") }] },
    ]) as { amount: unknown; splits: { shareAmount: unknown }[] }[];
    expect(result[0].amount).toBe(10);
    expect(result[0].splits[0].shareAmount).toBe(5);
  });

  it("leaves Date instances untouched instead of walking into them", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const result = convertDecimals({ date }) as { date: unknown };
    expect(result.date).toBe(date);
  });

  it("passes through null, primitives, and Decimal-free objects unchanged", () => {
    expect(convertDecimals(null)).toBeNull();
    expect(convertDecimals(42)).toBe(42);
    expect(convertDecimals("x")).toBe("x");
    expect(convertDecimals({ name: "Groceries" })).toEqual({ name: "Groceries" });
  });
});
