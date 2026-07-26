import { beforeEach, describe, expect, it, vi } from "vitest";
import { sweepDueOccurrences } from "./sweep-due-occurrences";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { sendCategoryEmail } from "@/lib/email/send-category-email";
import { getEffectivePreference } from "@/lib/notifications/entities/notification-preference";
import { generateNextOccurrenceIfDue } from "../actions/generate-next-occurrence";

vi.mock("@/lib/db", () => ({
  prisma: {
    household: { findMany: vi.fn() },
    reminderOccurrence: { updateMany: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/events/emit", () => ({ emitEvent: vi.fn() }));
vi.mock("@/lib/email/send-category-email", () => ({ sendCategoryEmail: vi.fn() }));
vi.mock("@/lib/notifications/entities/notification-preference", () => ({
  getEffectivePreference: vi.fn(),
  resolveReminderCategoryKey: vi.fn(() => "bill.due_soon"),
}));
vi.mock("../actions/generate-next-occurrence", () => ({ generateNextOccurrenceIfDue: vi.fn() }));

const now = new Date("2026-07-24T12:00:00.000Z");

function seedReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "reminder_1",
    householdId: "household_1",
    targetMemberId: "member_1",
    sourceType: "subscription",
    emailEnabled: true,
    ...overrides,
  };
}

// vi.resetAllMocks() (not clearAllMocks()) — clearAllMocks only resets call
// history, not queued mockResolvedValueOnce()/mockResolvedValue()
// implementations, so leftover queued values from one test's chained mocks
// would otherwise leak into the next test's first calls.
describe("sweepDueOccurrences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "household_1" }] as never);
    vi.mocked(prisma.reminderOccurrence.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValue([]);
  });

  it("claims a past-due pending occurrence, emits reminder.due, and delivers email when both gates are on (happy path)", async () => {
    vi.mocked(prisma.reminderOccurrence.updateMany).mockResolvedValueOnce({ count: 1 }); // pending -> notified claim
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValueOnce([
      { id: "occ_1", reminderId: "reminder_1", remindAt: now, reminder: seedReminder() },
    ] as never); // justFired
    vi.mocked(getEffectivePreference).mockResolvedValue({ emailEnabled: true, inAppEnabled: true, digestEnabled: true });

    const result = await sweepDueOccurrences(now);

    expect(prisma.household.findMany).toHaveBeenCalledWith({ where: { status: "active" }, select: { id: true } });
    expect(prisma.reminderOccurrence.updateMany).toHaveBeenNthCalledWith(1, {
      where: { householdId: "household_1", status: "pending", remindAt: { lte: now } },
      data: { status: "notified", notifiedAt: now },
    });
    expect(emitEvent).toHaveBeenCalledWith(
      "household_1",
      "reminder.due",
      { reminderId: "reminder_1", occurrenceId: "occ_1", remindAt: now },
      null,
    );
    expect(sendCategoryEmail).toHaveBeenCalledWith(
      { reminder: seedReminder(), occurrence: expect.objectContaining({ id: "occ_1" }) },
      "member_1",
      "bill.due_soon",
    );
    expect(result).toEqual({ fired: 1, missed: 0 });
  });

  it("skips email when the reminder's own emailEnabled override is off, even if the preference is on", async () => {
    vi.mocked(prisma.reminderOccurrence.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValueOnce([
      { id: "occ_1", reminderId: "reminder_1", remindAt: now, reminder: seedReminder({ emailEnabled: false }) },
    ] as never);
    vi.mocked(getEffectivePreference).mockResolvedValue({ emailEnabled: true, inAppEnabled: true, digestEnabled: true });

    await sweepDueOccurrences(now);

    expect(sendCategoryEmail).not.toHaveBeenCalled();
  });

  it("skips email when the member's category preference is off, even if the reminder allows email", async () => {
    vi.mocked(prisma.reminderOccurrence.updateMany).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValueOnce([
      { id: "occ_1", reminderId: "reminder_1", remindAt: now, reminder: seedReminder() },
    ] as never);
    vi.mocked(getEffectivePreference).mockResolvedValue({ emailEnabled: false, inAppEnabled: true, digestEnabled: true });

    await sweepDueOccurrences(now);

    expect(sendCategoryEmail).not.toHaveBeenCalled();
  });

  it("does nothing beyond the missed-candidates check when nothing was claimed and nothing is stale", async () => {
    await sweepDueOccurrences(now);

    expect(emitEvent).not.toHaveBeenCalled();
    expect(prisma.reminderOccurrence.updateMany).toHaveBeenCalledTimes(1); // only the pending -> notified claim
    expect(generateNextOccurrenceIfDue).not.toHaveBeenCalled();
  });

  it("sweeps a stale notified occurrence to missed and generates the next occurrence for a recurring reminder", async () => {
    const reminder = seedReminder({ reminderType: "recurring" });
    vi.mocked(prisma.reminderOccurrence.updateMany)
      .mockResolvedValueOnce({ count: 0 }) // pending -> notified claim: nothing due
      .mockResolvedValueOnce({ count: 1 }); // missed claim
    vi.mocked(prisma.reminderOccurrence.findMany)
      .mockResolvedValueOnce([{ id: "occ_1" }] as never) // missed candidates (id-only)
      .mockResolvedValueOnce([{ id: "occ_1", reminderId: "reminder_1", reminder }] as never); // justMissed, hydrated

    const result = await sweepDueOccurrences(now);

    const missedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(prisma.reminderOccurrence.findMany).toHaveBeenNthCalledWith(1, {
      where: { householdId: "household_1", status: "notified", notifiedAt: { lte: missedCutoff } },
      select: { id: true },
    });
    expect(prisma.reminderOccurrence.updateMany).toHaveBeenNthCalledWith(2, {
      where: { householdId: "household_1", id: { in: ["occ_1"] }, status: "notified" },
      data: { status: "missed" },
    });
    expect(generateNextOccurrenceIfDue).toHaveBeenCalledWith(reminder, { id: "occ_1", reminderId: "reminder_1", reminder });
    expect(result).toEqual({ fired: 0, missed: 1 });
  });

  it("processes multiple households independently", async () => {
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "household_1" }, { id: "household_2" }] as never);

    await sweepDueOccurrences(now);

    expect(prisma.reminderOccurrence.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ householdId: "household_1" }) }),
    );
    expect(prisma.reminderOccurrence.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ householdId: "household_2" }) }),
    );
  });

  it("keeps processing the rest of the batch when one occurrence's email send fails", async () => {
    vi.mocked(prisma.reminderOccurrence.updateMany).mockResolvedValueOnce({ count: 2 });
    vi.mocked(prisma.reminderOccurrence.findMany).mockResolvedValueOnce([
      { id: "occ_1", reminderId: "reminder_1", remindAt: now, reminder: seedReminder() },
      { id: "occ_2", reminderId: "reminder_2", remindAt: now, reminder: seedReminder({ id: "reminder_2" }) },
    ] as never);
    vi.mocked(getEffectivePreference).mockResolvedValue({ emailEnabled: true, inAppEnabled: true, digestEnabled: true });
    vi.mocked(sendCategoryEmail).mockRejectedValueOnce(new Error("Resend is down")).mockResolvedValueOnce(undefined as never);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sweepDueOccurrences(now);

    expect(sendCategoryEmail).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    expect(result).toEqual({ fired: 2, missed: 0 });
    consoleError.mockRestore();
  });
});
