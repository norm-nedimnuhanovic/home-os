import { describe, expect, it, vi } from "vitest";
import { seedStarterCategories } from "./seed-starter-categories";
import { STARTER_CATEGORIES } from "../entities/category";

describe("seedStarterCategories", () => {
  it("creates one Category row per starter category, scoped to the household", async () => {
    const createMany = vi.fn();
    const tx = { category: { createMany } } as never;

    await seedStarterCategories(tx, "household_1");

    expect(createMany).toHaveBeenCalledWith({
      data: STARTER_CATEGORIES.map((category, index) =>
        expect.objectContaining({
          householdId: "household_1",
          name: category.name,
          type: category.type,
          isSystemDefault: true,
          sortOrder: index,
        }),
      ),
    });
  });
});
