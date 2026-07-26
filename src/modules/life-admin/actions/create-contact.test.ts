import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContact } from "./create-contact";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitContactCreated } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { contact: { create: vi.fn() }, objectShare: { deleteMany: vi.fn(), createMany: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitContactCreated: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("createContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a contact scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: "contact_1", name: "Dr. Hasić" } as never);

    await createContact({ name: "Dr. Hasić", category: "medical", phone: "+387 61 000 000" });

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ householdId: "household_1", createdById: "cmember0000000000001" }),
      }),
    );
    expect(emitContactCreated).toHaveBeenCalledWith("household_1", "contact_1", "Dr. Hasić", "cmember0000000000001");
  });

  it("rejects a contact with no phone/email/address/website (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createContact({ name: "No Channel", category: "other" })).rejects.toThrow();
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });
});
