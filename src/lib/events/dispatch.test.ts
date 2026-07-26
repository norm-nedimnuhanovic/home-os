import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchToSubscribers } from "./dispatch";
import { prisma } from "@/lib/db";
import { eventHandlers } from "./handlers";
import { fanOutNotificationsForOccurrence } from "@/lib/notifications/dispatch";

vi.mock("@/lib/db", () => ({
  prisma: {
    eventSubscription: { findMany: vi.fn(), update: vi.fn() },
    eventOccurrence: { update: vi.fn() },
  },
}));
vi.mock("./handlers", () => ({ eventHandlers: {} }));
vi.mock("@/lib/notifications/dispatch", () => ({ fanOutNotificationsForOccurrence: vi.fn() }));

const rawOccurrence = {
  id: "occurrence_1",
  householdId: "household_1",
  eventTypeId: "event_type_1",
  payloadSnapshot: { taskId: "task_1" },
  eventType: { key: "task.completed" },
};
const baseOccurrence = rawOccurrence as never;

type Handler = (payload: unknown, householdId: string) => Promise<void>;
const handlers: Record<string, Handler> = eventHandlers;

function seedSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    subscriberModule: { key: "kanban" },
    consecutiveFailureCount: 0,
    active: true,
    onFailure: "log_only",
    ...overrides,
  };
}

describe("dispatchToSubscribers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eventHandlers is a plain object mock — reset per test.
    for (const key of Object.keys(handlers)) delete handlers[key];
  });

  it("always fans out notifications first, regardless of subscriptions", async () => {
    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([]);

    await dispatchToSubscribers(baseOccurrence);

    expect(fanOutNotificationsForOccurrence).toHaveBeenCalledWith(baseOccurrence);
  });

  it("scopes the final EventOccurrence update by both id and householdId — never id alone", async () => {
    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([]);

    await dispatchToSubscribers(baseOccurrence);

    expect(prisma.eventOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occurrence_1", householdId: "household_1" },
      data: { subscriptionsNotified: 0 },
    });
  });

  it("calls the compiled handler for a matching subscription and resets its failure count", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    handlers["kanban:task.completed"] = handler;
    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([seedSubscription()] as never);

    await dispatchToSubscribers(baseOccurrence);

    expect(handler).toHaveBeenCalledWith(rawOccurrence.payloadSnapshot, "household_1");
    expect(prisma.eventSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { consecutiveFailureCount: 0, lastTriggeredAt: expect.any(Date), lastError: null },
    });
    expect(prisma.eventOccurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { subscriptionsNotified: 1 } }),
    );
  });

  it("skips a subscription with no compiled handler wired, without throwing", async () => {
    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([seedSubscription()] as never);

    await expect(dispatchToSubscribers(baseOccurrence)).resolves.toBeUndefined();
    expect(prisma.eventSubscription.update).not.toHaveBeenCalled();
  });

  it("onFailure: ignore — a failure leaves consecutiveFailureCount and active untouched", async () => {
    handlers["kanban:task.completed"] = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([
      seedSubscription({ onFailure: "ignore" }),
    ] as never);

    await dispatchToSubscribers(baseOccurrence);

    expect(prisma.eventSubscription.update).not.toHaveBeenCalled();
  });

  it("onFailure: log_only — a failure increments the count but leaves active true", async () => {
    handlers["kanban:task.completed"] = vi.fn().mockRejectedValue(new Error("boom"));
    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([
      seedSubscription({ onFailure: "log_only", consecutiveFailureCount: 2 }),
    ] as never);

    await dispatchToSubscribers(baseOccurrence);

    expect(prisma.eventSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1" },
      data: { consecutiveFailureCount: 3, lastError: "boom", active: true },
    });
  });

  it("onFailure: disable_after_n_failures — flips active false exactly at the 5th consecutive failure, not before", async () => {
    handlers["kanban:task.completed"] = vi.fn().mockRejectedValue(new Error("boom"));

    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([
      seedSubscription({ onFailure: "disable_after_n_failures", consecutiveFailureCount: 3 }),
    ] as never);
    await dispatchToSubscribers(baseOccurrence);
    expect(prisma.eventSubscription.update).toHaveBeenLastCalledWith({
      where: { id: "sub_1" },
      data: { consecutiveFailureCount: 4, lastError: "boom", active: true },
    });

    vi.mocked(prisma.eventSubscription.findMany).mockResolvedValue([
      seedSubscription({ onFailure: "disable_after_n_failures", consecutiveFailureCount: 4 }),
    ] as never);
    await dispatchToSubscribers(baseOccurrence);
    expect(prisma.eventSubscription.update).toHaveBeenLastCalledWith({
      where: { id: "sub_1" },
      data: { consecutiveFailureCount: 5, lastError: "boom", active: false },
    });
  });
});
