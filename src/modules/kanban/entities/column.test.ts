import { describe, expect, it } from "vitest";
import { createColumnInputSchema, moveCardInputSchema } from "./column";

describe("createColumnInputSchema", () => {
  it("accepts a column with a valid name", () => {
    const result = createColumnInputSchema.safeParse({ name: "Blocked" });
    expect(result.success).toBe(true);
  });

  it("defaults columnType to custom when omitted", () => {
    const result = createColumnInputSchema.parse({ name: "Blocked" });
    expect(result.columnType).toBe("custom");
  });

  it("rejects a name longer than 40 characters", () => {
    const result = createColumnInputSchema.safeParse({ name: "a".repeat(41) });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid columnType", () => {
    const result = createColumnInputSchema.safeParse({ name: "Done", columnType: "archived" });
    expect(result.success).toBe(false);
  });
});

describe("moveCardInputSchema", () => {
  it("accepts a valid move", () => {
    const result = moveCardInputSchema.safeParse({
      taskId: "cmember0000000000001",
      columnId: "cmember0000000000002",
      boardPosition: 1.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-cuid taskId", () => {
    const result = moveCardInputSchema.safeParse({
      taskId: "not-a-cuid",
      columnId: "cmember0000000000002",
      boardPosition: 1,
    });
    expect(result.success).toBe(false);
  });
});
