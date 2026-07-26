import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateContact } from "./update-contact";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findFirst: vi.fn(), update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitContactUpdated: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("updateContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets a household member who did NOT create the contact edit it (plan.md §9 Q30)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: "contact_1",
      householdId: "household_1",
      createdById: "cmember0000000000001",
      visibility: "household",
    } as never);
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: "contact_1" } as never);

    await expect(
      updateContact("contact_1", { name: "Updated", category: "other", phone: "123" }),
    ).resolves.toBeDefined();
    expect(prisma.contact.update).toHaveBeenCalled();
  });

  it("blocks a member with no visibility into a private contact from editing it", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null); // visibilityWhere() excluded it

    await expect(
      updateContact("contact_1", { name: "Updated", category: "other", phone: "123" }),
    ).rejects.toThrow(NotFoundError);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});
