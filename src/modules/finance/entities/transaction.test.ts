import { describe, expect, it } from "vitest";
import { createTransactionInputSchema } from "./transaction";

const base = {
  amount: 100,
  categoryId: "ccategory0000000000001",
  title: "Groceries",
  date: new Date("2026-08-01"),
  paidById: "cmember0000000000001",
};

describe("createTransactionInputSchema", () => {
  it("accepts a valid no-split transaction", () => {
    expect(createTransactionInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(createTransactionInputSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(createTransactionInputSchema.safeParse({ ...base, amount: -5 }).success).toBe(false);
  });

  it("defaults type to expense and splitType to none", () => {
    const result = createTransactionInputSchema.parse(base);
    expect(result.type).toBe("expense");
    expect(result.splitType).toBe("none");
  });

  it("rejects splitType=equal with no members picked", () => {
    const result = createTransactionInputSchema.safeParse({ ...base, splitType: "equal" });
    expect(result.success).toBe(false);
  });

  it("accepts splitType=equal with members picked", () => {
    const result = createTransactionInputSchema.safeParse({
      ...base,
      splitType: "equal",
      splitMemberIds: ["cmember0000000000001", "cmember0000000000002"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects splitType=custom whose shares don't sum to the transaction amount", () => {
    const result = createTransactionInputSchema.safeParse({
      ...base,
      splitType: "custom",
      splitShares: [
        { memberId: "cmember0000000000001", amount: 40 },
        { memberId: "cmember0000000000002", amount: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts splitType=custom whose shares sum exactly to the transaction amount", () => {
    const result = createTransactionInputSchema.safeParse({
      ...base,
      splitType: "custom",
      splitShares: [
        { memberId: "cmember0000000000001", amount: 60 },
        { memberId: "cmember0000000000002", amount: 40 },
      ],
    });
    expect(result.success).toBe(true);
  });
});
