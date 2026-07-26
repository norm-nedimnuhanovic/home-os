import { beforeEach, describe, expect, it, vi } from "vitest";
import { postSubscriptionPayment } from "./post-subscription-payment";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: { create: vi.fn() },
    subscription: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const subscription = {
  id: "sub_1",
  householdId: "household_1",
  name: "Netflix",
  amount: 15,
  categoryId: "cat_1",
  nextDueDate: new Date("2026-08-01"),
  frequency: "monthly" as const,
  customIntervalDays: null,
};

describe("postSubscriptionPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts a Transaction (source=subscription) and advances nextDueDate/lastPaidDate", async () => {
    vi.mocked(prisma.transaction.create).mockReturnValue("create-txn-promise" as never);
    vi.mocked(prisma.subscription.update).mockReturnValue("update-sub-promise" as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([
      { id: "txn_1" },
      { id: "sub_1", nextDueDate: new Date("2026-09-01") },
    ]);

    await postSubscriptionPayment(subscription as never, "cmember0000000000001");

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          source: "subscription",
          subscriptionId: "sub_1",
          paidById: "cmember0000000000001",
          amount: 15,
        }),
      }),
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_1", householdId: "household_1" },
        data: expect.objectContaining({ lastPaidDate: subscription.nextDueDate }),
      }),
    );
  });
});
