import { beforeEach, describe, expect, it, vi } from "vitest";
import { markSubscriptionPaid } from "./mark-subscription-paid";
import { requireMember } from "@/lib/auth/session";
import { getSubscription } from "../queries/get-subscription";
import { postSubscriptionPayment } from "./post-subscription-payment";

vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-subscription", () => ({ getSubscription: vi.fn() }));
vi.mock("./post-subscription-payment", () => ({ postSubscriptionPayment: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "cmember0000000000001",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("markSubscriptionPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to postSubscriptionPayment with the acting member as payer (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getSubscription).mockResolvedValue({ id: "sub_1" } as never);
    vi.mocked(postSubscriptionPayment).mockResolvedValue({ transaction: {}, subscription: {} } as never);

    await markSubscriptionPaid("sub_1");

    expect(getSubscription).toHaveBeenCalledWith("household_1", "sub_1");
    expect(postSubscriptionPayment).toHaveBeenCalledWith({ id: "sub_1" }, "cmember0000000000001");
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(markSubscriptionPaid("sub_1")).rejects.toThrow("Not authenticated");
    expect(postSubscriptionPayment).not.toHaveBeenCalled();
  });
});
