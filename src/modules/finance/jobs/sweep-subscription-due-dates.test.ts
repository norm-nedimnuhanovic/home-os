import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "date-fns";
import { sweepSubscriptionDueDates } from "./sweep-subscription-due-dates";
import { prisma } from "@/lib/db";
import { createReminder } from "@/modules/reminders";
import { postSubscriptionPayment } from "../actions/post-subscription-payment";
import { emitBillDueSoon } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: {
    household: { findMany: vi.fn() },
    subscription: { findMany: vi.fn() },
    reminder: { findFirst: vi.fn() },
  },
}));
vi.mock("@/modules/reminders", () => ({ createReminder: vi.fn() }));
vi.mock("../actions/post-subscription-payment", () => ({ postSubscriptionPayment: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitBillDueSoon: vi.fn() }));

function subscriptionDueIn(days: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    householdId: "household_1",
    name: "Netflix",
    nextDueDate: addDays(new Date(), days),
    alertDaysBefore: 3,
    responsibleMemberId: "member_1",
    autoCreateTransaction: false,
    startDate: new Date("2026-01-01"),
    lastPaidDate: null,
    ...overrides,
  };
}

describe("sweepSubscriptionDueDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "household_1" }] as never);
  });

  it("ignores a subscription outside its alertDaysBefore window", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([subscriptionDueIn(10)] as never);

    await sweepSubscriptionDueDates();

    expect(createReminder).not.toHaveBeenCalled();
  });

  it("creates a due-soon Reminder for a subscription within its alert window", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([subscriptionDueIn(2)] as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue(null);

    await sweepSubscriptionDueDates();

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: "household_1",
        targetMemberId: "member_1",
        sourceType: "subscription",
        sourceEntityId: "sub_1",
      }),
    );
    expect(emitBillDueSoon).toHaveBeenCalledWith("household_1", "sub_1", expect.any(Date));
  });

  it("doesn't re-fire when a Reminder already exists for this due cycle (idempotency)", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([subscriptionDueIn(2)] as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue({ id: "reminder_existing" } as never);

    await sweepSubscriptionDueDates();

    expect(createReminder).not.toHaveBeenCalled();
  });

  it("posts a payment automatically for an autoCreateTransaction subscription due today or earlier", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([
      subscriptionDueIn(0, { autoCreateTransaction: true }),
    ] as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue({ id: "reminder_existing" } as never);

    await sweepSubscriptionDueDates();

    expect(postSubscriptionPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_1" }),
      "member_1",
    );
  });

  it("does not post a payment for an autoCreateTransaction subscription that's merely approaching, not yet due", async () => {
    vi.mocked(prisma.subscription.findMany).mockResolvedValue([
      subscriptionDueIn(2, { autoCreateTransaction: true }),
    ] as never);
    vi.mocked(prisma.reminder.findFirst).mockResolvedValue({ id: "reminder_existing" } as never);

    await sweepSubscriptionDueDates();

    expect(postSubscriptionPayment).not.toHaveBeenCalled();
  });
});
