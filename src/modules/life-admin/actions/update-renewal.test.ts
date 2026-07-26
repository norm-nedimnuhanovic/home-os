import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateRenewal } from "./update-renewal";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { regenerateRenewalReminders } from "./regenerate-renewal-reminders";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    renewal: { findFirst: vi.fn(), update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("./regenerate-renewal-reminders", () => ({ regenerateRenewalReminders: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const existingRenewal = {
  id: "renewal_1",
  householdId: "household_1",
  createdById: "cmember0000000000001",
  responsibleMemberId: null,
  visibility: "household",
  expiryDate: new Date("2027-01-01"),
  reminderOffsetsDays: [30],
};

describe("updateRenewal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the creator update it and regenerates reminders when expiryDate changes (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue(existingRenewal as never);
    vi.mocked(prisma.renewal.update).mockResolvedValue({
      ...existingRenewal,
      expiryDate: new Date("2027-06-01"),
    } as never);

    await updateRenewal("renewal_1", {
      title: "Car insurance",
      type: "insurance",
      expiryDate: new Date("2027-06-01"),
    });

    expect(prisma.renewal.update).toHaveBeenCalled();
    expect(regenerateRenewalReminders).toHaveBeenCalled();
  });

  it("blocks a member who neither created it nor is responsible for it (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue(existingRenewal as never);

    await expect(
      updateRenewal("renewal_1", { title: "Car insurance", type: "insurance", expiryDate: new Date("2027-06-01") }),
    ).rejects.toThrow(ForbiddenError);
    expect(prisma.renewal.update).not.toHaveBeenCalled();
  });
});
