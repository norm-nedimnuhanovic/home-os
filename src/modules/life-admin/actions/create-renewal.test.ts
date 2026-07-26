import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRenewal } from "./create-renewal";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { regenerateRenewalReminders } from "./regenerate-renewal-reminders";
import { emitRenewalCreated } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { renewal: { create: vi.fn() }, objectShare: { deleteMany: vi.fn(), createMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("./regenerate-renewal-reminders", () => ({ regenerateRenewalReminders: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitRenewalCreated: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("createRenewal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a renewal and generates its reminders (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.renewal.create).mockResolvedValue({ id: "renewal_1", title: "Car insurance" } as never);

    await createRenewal({ title: "Car insurance", type: "insurance", expiryDate: new Date("2027-01-01") });

    expect(prisma.renewal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ householdId: "household_1", createdById: "cmember0000000000001" }) }),
    );
    expect(regenerateRenewalReminders).toHaveBeenCalledWith(
      { id: "renewal_1", title: "Car insurance" },
      "cmember0000000000001",
    );
    expect(emitRenewalCreated).toHaveBeenCalled();
  });

  it("rejects a renewal missing a required field (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createRenewal({ title: "Car insurance" } as never)).rejects.toThrow();
    expect(prisma.renewal.create).not.toHaveBeenCalled();
  });
});
