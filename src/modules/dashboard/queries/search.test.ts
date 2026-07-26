import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { searchEverything } from "./search";
import { getVisibleTasks } from "@/modules/tasks";
import { getVisibleNotes } from "@/modules/notes";
import { getVisibleTransactions } from "@/modules/finance";
import { getVisibleContacts } from "@/modules/life-admin";

vi.mock("@/lib/db", () => ({
  prisma: { moduleSurfaceRegistration: { findMany: vi.fn() } },
}));
vi.mock("@/modules/tasks", () => ({ getVisibleTasks: vi.fn() }));
vi.mock("@/modules/notes", () => ({ getVisibleNotes: vi.fn() }));
vi.mock("@/modules/finance", () => ({ getVisibleTransactions: vi.fn() }));
vi.mock("@/modules/life-admin", () => ({ getVisibleContacts: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("searchEverything", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns nothing for a query shorter than 2 characters, without querying any module", async () => {
    const result = await searchEverything(actingMember as never, "a");

    expect(result).toEqual([]);
    expect(prisma.moduleSurfaceRegistration.findMany).not.toHaveBeenCalled();
  });

  it("only searches modules that actually registered a global_search_provider surface", async () => {
    vi.mocked(prisma.moduleSurfaceRegistration.findMany).mockResolvedValue([
      { module: { key: "tasks" } },
    ] as never);
    vi.mocked(getVisibleTasks).mockResolvedValue([{ id: "task_1", title: "Buy milk" }] as never);

    const result = await searchEverything(actingMember as never, "milk");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "task", entityId: "task_1", title: "Buy milk" });
    expect(getVisibleNotes).not.toHaveBeenCalled();
    expect(getVisibleTransactions).not.toHaveBeenCalled();
    expect(getVisibleContacts).not.toHaveBeenCalled();
  });

  it("filters case-insensitively and excludes non-matching rows", async () => {
    vi.mocked(prisma.moduleSurfaceRegistration.findMany).mockResolvedValue([
      { module: { key: "tasks" } },
    ] as never);
    vi.mocked(getVisibleTasks).mockResolvedValue([
      { id: "task_1", title: "Buy MILK" },
      { id: "task_2", title: "Walk the dog" },
    ] as never);

    const result = await searchEverything(actingMember as never, "milk");

    expect(result).toHaveLength(1);
    expect(result[0].entityId).toBe("task_1");
  });
});
