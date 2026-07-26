import { describe, expect, it } from "vitest";
import { createTaskInputSchema } from "./task";
import { getTaskStatus } from "./task";

describe("createTaskInputSchema", () => {
  it("accepts a task with a valid title", () => {
    const result = createTaskInputSchema.safeParse({ title: "Take out the bins" });
    expect(result.success).toBe(true);
  });

  it("rejects a task with an empty title", () => {
    const result = createTaskInputSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["title"]);
    }
  });

  it("rejects a task with no title field at all", () => {
    const result = createTaskInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 200 characters", () => {
    const result = createTaskInputSchema.safeParse({ title: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("accepts a title at exactly the 200-character boundary", () => {
    const result = createTaskInputSchema.safeParse({ title: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("defaults priority to medium and visibility to household when omitted", () => {
    const result = createTaskInputSchema.parse({ title: "Water the plants" });
    expect(result.priority).toBe("medium");
    expect(result.visibility).toBe("household");
  });
});

describe("getTaskStatus", () => {
  it("returns completed when completedAt is set", () => {
    expect(getTaskStatus({ completedAt: new Date(), dueDate: null })).toBe("completed");
  });

  it("returns overdue when dueDate is in the past and not completed", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(getTaskStatus({ completedAt: null, dueDate: yesterday })).toBe("overdue");
  });

  it("returns open when there's no dueDate and it isn't completed", () => {
    expect(getTaskStatus({ completedAt: null, dueDate: null })).toBe("open");
  });
});
