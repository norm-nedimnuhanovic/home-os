import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelRenewal } from "./cancel-renewal";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { cancelRenewalReminders } from "./regenerate-renewal-reminders";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { renewal: { findFirst: vi.fn(), update: vi.fn() }, objectShare: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("./regenerate-renewal-reminders", () => ({ cancelRenewalReminders: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitRenewalCancelled: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const existingRenewal = {
  id: "renewal_1",
  householdId: "household_1",
  createdById: "cmember0000000000001",
  responsibleMemberId: "cmember0000000000002",
};

describe("cancelRenewal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the responsible member cancel it and cancels its reminders (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue(existingRenewal as never);
    vi.mocked(prisma.renewal.update).mockResolvedValue({ id: "renewal_1", status: "cancelled" } as never);

    await cancelRenewal("renewal_1");

    expect(prisma.renewal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "cancelled" } }),
    );
    expect(cancelRenewalReminders).toHaveBeenCalled();
  });

  it("blocks a member who neither created it nor is responsible for it (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000003",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.renewal.findFirst).mockResolvedValue(existingRenewal as never);

    await expect(cancelRenewal("renewal_1")).rejects.toThrow(ForbiddenError);
    expect(prisma.renewal.update).not.toHaveBeenCalled();
  });
});
