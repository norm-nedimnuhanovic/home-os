import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateNextOccurrenceIfDue } from "./generate-next-occurrence";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    reminderOccurrence: { count: vi.fn(), create: vi.fn() },
  },
}));

function seedReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "reminder_1",
    householdId: "household_1",
    reminderType: "recurring",
    status: "active",
    recurrenceFrequency: "weekly",
    recurrenceInterval: 1,
    recurrenceCount: null,
    recurrenceEndDate: null,
    ...overrides,
  };
}

function seedOccurrence(remindAt: Date) {
  return { id: "occ_1", reminderId: "reminder_1", remindAt, status: "completed" };
}

describe("generateNextOccurrenceIfDue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the next occurrence at remindAt + interval (happy path, weekly)", async () => {
    const remindAt = new Date("2026-07-24T09:00:00.000Z");
    await generateNextOccurrenceIfDue(seedReminder() as never, seedOccurrence(remindAt) as never);

    expect(prisma.reminderOccurrence.create).toHaveBeenCalledWith({
      data: {
        householdId: "household_1",
        reminderId: "reminder_1",
        remindAt: new Date("2026-07-31T09:00:00.000Z"),
        status: "pending",
      },
    });
  });

  it("respects recurrenceInterval > 1", async () => {
    const remindAt = new Date("2026-07-24T09:00:00.000Z");
    await generateNextOccurrenceIfDue(
      seedReminder({ recurrenceFrequency: "daily", recurrenceInterval: 3 }) as never,
      seedOccurrence(remindAt) as never,
    );

    expect(prisma.reminderOccurrence.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remindAt: new Date("2026-07-27T09:00:00.000Z") }) }),
    );
  });

  it("does nothing for a one_off reminder", async () => {
    await generateNextOccurrenceIfDue(
      seedReminder({ reminderType: "one_off" }) as never,
      seedOccurrence(new Date()) as never,
    );

    expect(prisma.reminderOccurrence.create).not.toHaveBeenCalled();
  });

  it("does nothing for a cancelled/paused reminder", async () => {
    await generateNextOccurrenceIfDue(seedReminder({ status: "cancelled" }) as never, seedOccurrence(new Date()) as never);

    expect(prisma.reminderOccurrence.create).not.toHaveBeenCalled();
  });

  it("stops generating once recurrenceEndDate would be exceeded", async () => {
    const remindAt = new Date("2026-07-24T09:00:00.000Z");
    await generateNextOccurrenceIfDue(
      seedReminder({ recurrenceEndDate: new Date("2026-07-28T00:00:00.000Z") }) as never,
      seedOccurrence(remindAt) as never,
    );

    expect(prisma.reminderOccurrence.create).not.toHaveBeenCalled();
  });

  it("stops generating once recurrenceCount is already reached", async () => {
    vi.mocked(prisma.reminderOccurrence.count).mockResolvedValue(5);

    await generateNextOccurrenceIfDue(
      seedReminder({ recurrenceCount: 5 }) as never,
      seedOccurrence(new Date("2026-07-24T09:00:00.000Z")) as never,
    );

    expect(prisma.reminderOccurrence.count).toHaveBeenCalledWith({
      where: { householdId: "household_1", reminderId: "reminder_1" },
    });
    expect(prisma.reminderOccurrence.create).not.toHaveBeenCalled();
  });

  it("still generates when recurrenceCount hasn't been reached yet", async () => {
    vi.mocked(prisma.reminderOccurrence.count).mockResolvedValue(2);

    await generateNextOccurrenceIfDue(
      seedReminder({ recurrenceCount: 5 }) as never,
      seedOccurrence(new Date("2026-07-24T09:00:00.000Z")) as never,
    );

    expect(prisma.reminderOccurrence.create).toHaveBeenCalled();
  });
});
