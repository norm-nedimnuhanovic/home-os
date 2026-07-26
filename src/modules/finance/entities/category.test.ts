import { describe, expect, it } from "vitest";
import { createCategoryInputSchema, STARTER_CATEGORIES } from "./category";

describe("createCategoryInputSchema", () => {
  it("accepts a valid category", () => {
    expect(createCategoryInputSchema.safeParse({ name: "Groceries" }).success).toBe(true);
  });

  it("defaults type to expense", () => {
    expect(createCategoryInputSchema.parse({ name: "Groceries" }).type).toBe("expense");
  });

  it("rejects an empty name", () => {
    expect(createCategoryInputSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("STARTER_CATEGORIES", () => {
  it("includes both expense and income starter categories", () => {
    expect(STARTER_CATEGORIES.some((c) => c.type === "expense")).toBe(true);
    expect(STARTER_CATEGORIES.some((c) => c.type === "income")).toBe(true);
  });
});
