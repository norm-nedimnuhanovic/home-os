import { describe, expect, it } from "vitest";
import { reminderInputSchema, createManualReminderInputSchema } from "./reminder";

describe("reminderInputSchema", () => {
  const base = {
    householdId: "chousehold000000000001",
    title: "Pay rent",
    targetMemberId: "cmember0000000000001",
    createdByMemberId: "cmember0000000000001",
    firstRemindAt: new Date("2026-08-01"),
  };

  it("accepts a valid manual, one-off reminder", () => {
    expect(reminderInputSchema.safeParse(base).success).toBe(true);
  });

  it("defaults sourceType to manual and reminderType to one_off", () => {
    const result = reminderInputSchema.parse(base);
    expect(result.sourceType).toBe("manual");
    expect(result.reminderType).toBe("one_off");
  });

  it("rejects a non-manual sourceType with no sourceModule", () => {
    const result = reminderInputSchema.safeParse({ ...base, sourceType: "budget" });
    expect(result.success).toBe(false);
  });

  it("accepts a non-manual sourceType when sourceModule is set", () => {
    const result = reminderInputSchema.safeParse({
      ...base,
      sourceType: "budget",
      sourceModule: "finance",
      sourceEntityId: "cbudget0000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a recurring reminder with no recurrenceFrequency", () => {
    const result = reminderInputSchema.safeParse({ ...base, reminderType: "recurring" });
    expect(result.success).toBe(false);
  });

  it("rejects a recurrenceEndDate on or before firstRemindAt", () => {
    const result = reminderInputSchema.safeParse({
      ...base,
      reminderType: "recurring",
      recurrenceFrequency: "monthly",
      recurrenceEndDate: new Date("2026-07-01"),
    });
    expect(result.success).toBe(false);
  });
});

describe("createManualReminderInputSchema", () => {
  it("accepts a minimal manual reminder", () => {
    const result = createManualReminderInputSchema.safeParse({
      title: "Pay rent",
      targetMemberId: "cmember0000000000001",
      firstRemindAt: new Date("2026-08-01"),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = createManualReminderInputSchema.safeParse({
      title: "",
      targetMemberId: "cmember0000000000001",
      firstRemindAt: new Date("2026-08-01"),
    });
    expect(result.success).toBe(false);
  });
});
