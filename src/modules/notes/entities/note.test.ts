import { describe, expect, it } from "vitest";
import { createNoteInputSchema } from "./note";

describe("createNoteInputSchema", () => {
  it("accepts a note with just a body", () => {
    const result = createNoteInputSchema.safeParse({ body: "Some thoughts." });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = createNoteInputSchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
  });

  it("defaults isPinned to false, tagIds to [], and visibility to household", () => {
    const result = createNoteInputSchema.parse({ body: "Some thoughts." });
    expect(result.isPinned).toBe(false);
    expect(result.tagIds).toEqual([]);
    expect(result.visibility).toBe("household");
  });

  it("rejects specific_members visibility with no one picked", () => {
    const result = createNoteInputSchema.safeParse({
      body: "Some thoughts.",
      visibility: "specific_members",
      sharedWithMemberIds: [],
    });
    expect(result.success).toBe(false);
  });
});
