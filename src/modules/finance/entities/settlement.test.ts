import { describe, expect, it } from "vitest";
import { createSettlementInputSchema } from "./settlement";

describe("createSettlementInputSchema", () => {
  it("accepts a valid settlement between two different members", () => {
    const result = createSettlementInputSchema.safeParse({
      fromMemberId: "cmember0000000000001",
      toMemberId: "cmember0000000000002",
      amount: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a settlement from a member to themself", () => {
    const result = createSettlementInputSchema.safeParse({
      fromMemberId: "cmember0000000000001",
      toMemberId: "cmember0000000000001",
      amount: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    const result = createSettlementInputSchema.safeParse({
      fromMemberId: "cmember0000000000001",
      toMemberId: "cmember0000000000002",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });
});
