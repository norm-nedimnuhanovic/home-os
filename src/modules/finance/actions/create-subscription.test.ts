import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubscription } from "./create-subscription";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { create: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "cmember0000000000001",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

const base = {
  name: "Netflix",
  categoryId: "ccategory0000000000001",
  amount: 15,
  startDate: new Date("2026-08-01"),
  responsibleMemberId: "cmember0000000000001",
};

describe("createSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a subscription with nextDueDate seeded from startDate (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.subscription.create).mockResolvedValue({ id: "sub_1" } as never);

    await createSubscription(base);

    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          name: "Netflix",
          nextDueDate: base.startDate,
        }),
      }),
    );
  });

  it("rejects frequency=custom with no customIntervalDays before ever calling prisma.subscription.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createSubscription({ ...base, frequency: "custom" })).rejects.toThrow();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });
});
