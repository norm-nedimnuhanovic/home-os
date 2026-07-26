import { beforeEach, describe, expect, it, vi } from "vitest";
import { resumeSubscription } from "./resume-subscription";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { subscription: { update: vi.fn() } },
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

describe("resumeSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets status to active (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.subscription.update).mockResolvedValue({ id: "sub_1" } as never);

    await resumeSubscription("sub_1");

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub_1", householdId: "household_1" },
      data: { status: "active" },
    });
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(resumeSubscription("sub_1")).rejects.toThrow("Not authenticated");
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
