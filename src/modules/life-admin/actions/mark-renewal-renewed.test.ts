import { beforeEach, describe, expect, it, vi } from "vitest";
import { markRenewalRenewed } from "./mark-renewal-renewed";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { regenerateRenewalReminders, cancelRenewalReminders } from "./regenerate-renewal-reminders";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { renewal: { findFirst: vi.fn(), update: vi.fn() }, objectShare: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("./regenerate-renewal-reminders", () => ({
  regenerateRenewalReminders: vi.fn(),
  cancelRenewalReminders: vi.fn(),
}));
vi.mock("../events/emitters", () => ({ emitRenewalRenewed: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("markRenewalRenewed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resets a recurring renewal back to active and regenerates reminders (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue({
      id: "renewal_1",
      householdId: "household_1",
      createdById: "cmember0000000000001",
      responsibleMemberId: null,
      recurrence: "annual",
    } as never);
    vi.mocked(prisma.renewal.update).mockResolvedValue({ id: "renewal_1", status: "active" } as never);

    await markRenewalRenewed("renewal_1", { newExpiryDate: new Date("2028-01-01") });

    expect(prisma.renewal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }),
    );
    expect(regenerateRenewalReminders).toHaveBeenCalled();
    expect(cancelRenewalReminders).not.toHaveBeenCalled();
  });

  it("terminally marks a one-time renewal as 'renewed' and cancels its reminders, not regenerates", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue({
      id: "renewal_1",
      householdId: "household_1",
      createdById: "cmember0000000000001",
      responsibleMemberId: null,
      recurrence: "none",
    } as never);
    vi.mocked(prisma.renewal.update).mockResolvedValue({ id: "renewal_1", status: "renewed" } as never);

    await markRenewalRenewed("renewal_1", { newExpiryDate: new Date("2028-01-01") });

    expect(cancelRenewalReminders).toHaveBeenCalled();
    expect(regenerateRenewalReminders).not.toHaveBeenCalled();
  });

  it("blocks a member who neither created it nor is responsible for it (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue({
      id: "renewal_1",
      householdId: "household_1",
      createdById: "cmember0000000000001",
      responsibleMemberId: null,
      recurrence: "none",
    } as never);

    await expect(markRenewalRenewed("renewal_1", { newExpiryDate: new Date("2028-01-01") })).rejects.toThrow(
      ForbiddenError,
    );
    expect(prisma.renewal.update).not.toHaveBeenCalled();
  });
});
