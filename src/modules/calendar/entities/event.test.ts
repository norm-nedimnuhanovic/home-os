import { describe, expect, it } from "vitest";
import { createEventInputSchema } from "./event";

describe("createEventInputSchema", () => {
  const base = { title: "Dentist appointment", startAt: new Date("2026-08-01T10:00:00Z") };

  it("accepts a valid event with endAt after startAt", () => {
    const result = createEventInputSchema.safeParse({
      ...base,
      endAt: new Date("2026-08-01T11:00:00Z"),
    });
    expect(result.success).toBe(true);
  });

  it("accepts endAt equal to startAt", () => {
    const result = createEventInputSchema.safeParse({ ...base, endAt: base.startAt });
    expect(result.success).toBe(true);
  });

  it("rejects endAt before startAt", () => {
    const result = createEventInputSchema.safeParse({
      ...base,
      endAt: new Date("2026-08-01T09:00:00Z"),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("endAt"))).toBe(true);
    }
  });

  it("rejects an empty title", () => {
    const result = createEventInputSchema.safeParse({ ...base, title: "", endAt: base.startAt });
    expect(result.success).toBe(false);
  });

  it("defaults allDay to false and visibility to household", () => {
    const result = createEventInputSchema.parse({ ...base, endAt: base.startAt });
    expect(result.allDay).toBe(false);
    expect(result.visibility).toBe("household");
  });
});
