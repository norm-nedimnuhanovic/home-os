import { describe, expect, it } from "vitest";
import { upsertJournalEntryInputSchema } from "./journal";

describe("upsertJournalEntryInputSchema", () => {
  it("accepts a valid entry", () => {
    const result = upsertJournalEntryInputSchema.safeParse({
      body: "Today was a good day.",
      entryDate: new Date("2026-08-01"),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = upsertJournalEntryInputSchema.safeParse({
      body: "",
      entryDate: new Date("2026-08-01"),
    });
    expect(result.success).toBe(false);
  });
});
