import { beforeEach, describe, expect, it, vi } from "vitest";
import { sweepRenewalLifecycle } from "./sweep-renewal-lifecycle";
import { prisma } from "@/lib/db";
import { emitRenewalExpiringSoon, emitRenewalExpired } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: {
    household: { findMany: vi.fn() },
    renewal: { findMany: vi.fn() },
    eventOccurrence: { findFirst: vi.fn() },
  },
}));
vi.mock("../events/emitters", () => ({
  emitRenewalExpiringSoon: vi.fn(),
  emitRenewalExpired: vi.fn(),
  emitRenewalCreated: vi.fn(),
  emitRenewalRenewed: vi.fn(),
  emitRenewalCancelled: vi.fn(),
}));

const now = new Date("2026-07-24T12:00:00.000Z");

function seedRenewal(overrides: Record<string, unknown> = {}) {
  return {
    id: "renewal_1",
    householdId: "household_1",
    title: "Car insurance",
    expiryDate: new Date("2026-08-01T00:00:00.000Z"),
    reminderOffsetsDays: [30],
    status: "active",
    lastRenewedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("sweepRenewalLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.household.findMany).mockResolvedValue([{ id: "household_1" }] as never);
    vi.mocked(prisma.eventOccurrence.findFirst).mockResolvedValue(null);
  });

  it("emits renewal.expiring_soon exactly once for a renewal newly inside its offset window (happy path)", async () => {
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([seedRenewal()] as never);

    const result = await sweepRenewalLifecycle(now);

    expect(emitRenewalExpiringSoon).toHaveBeenCalledWith("household_1", "renewal_1", seedRenewal().expiryDate);
    expect(emitRenewalExpired).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, expiringSoonAlerted: 1, expiredAlerted: 0 });
  });

  it("emits renewal.expired instead, once expiryDate has passed", async () => {
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([
      seedRenewal({ expiryDate: new Date("2026-07-01T00:00:00.000Z") }),
    ] as never);

    await sweepRenewalLifecycle(now);

    expect(emitRenewalExpired).toHaveBeenCalledWith("household_1", "renewal_1");
    expect(emitRenewalExpiringSoon).not.toHaveBeenCalled();
  });

  it("skips a renewal still outside its offset window", async () => {
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([
      seedRenewal({ expiryDate: new Date("2026-12-01T00:00:00.000Z") }),
    ] as never);

    const result = await sweepRenewalLifecycle(now);

    expect(emitRenewalExpiringSoon).not.toHaveBeenCalled();
    expect(emitRenewalExpired).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, expiringSoonAlerted: 0, expiredAlerted: 0 });
  });

  it("doesn't re-emit within the same lifecycle window (idempotency)", async () => {
    vi.mocked(prisma.eventOccurrence.findFirst).mockResolvedValue({ id: "occ_1" } as never);
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([seedRenewal()] as never);

    await sweepRenewalLifecycle(now);

    expect(emitRenewalExpiringSoon).not.toHaveBeenCalled();
  });

  it("scopes the idempotency check by the renewal's own cycle start, householdId, and renewalId", async () => {
    vi.mocked(prisma.renewal.findMany).mockResolvedValue([seedRenewal()] as never);

    await sweepRenewalLifecycle(now);

    expect(prisma.eventOccurrence.findFirst).toHaveBeenCalledWith({
      where: {
        householdId: "household_1",
        eventType: { key: "renewal.expiring_soon" },
        occurredAt: { gte: seedRenewal().createdAt },
        payloadSnapshot: { path: ["renewalId"], equals: "renewal_1" },
      },
    });
  });
});
