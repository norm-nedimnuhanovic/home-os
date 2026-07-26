import { describe, expect, it } from "vitest";
import { createBoardInputSchema } from "./board";

describe("createBoardInputSchema", () => {
  it("accepts a board with a valid name", () => {
    const result = createBoardInputSchema.safeParse({ name: "Household Chores" });
    expect(result.success).toBe(true);
  });

  it("rejects a board with an empty name", () => {
    const result = createBoardInputSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 60 characters", () => {
    const result = createBoardInputSchema.safeParse({ name: "a".repeat(61) });
    expect(result.success).toBe(false);
  });

  it("defaults visibility to household when omitted", () => {
    const result = createBoardInputSchema.parse({ name: "Household Chores" });
    expect(result.visibility).toBe("household");
  });

  it("rejects specific_members visibility with no one picked", () => {
    const result = createBoardInputSchema.safeParse({
      name: "Household Chores",
      visibility: "specific_members",
      sharedWithMemberIds: [],
    });
    expect(result.success).toBe(false);
  });
});
