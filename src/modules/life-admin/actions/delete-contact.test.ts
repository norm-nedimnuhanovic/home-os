import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteContact } from "./delete-contact";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findFirst: vi.fn(), delete: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    document: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const contactRow = {
  id: "contact_1",
  householdId: "household_1",
  createdById: "cmember0000000000001",
  visibility: "household",
};

describe("deleteContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the creator delete their own contact (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000001",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(contactRow as never);

    await deleteContact("contact_1");

    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: "contact_1", householdId: "household_1" } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ linkedEntityType: "contact", linkedEntityId: "contact_1" }),
      }),
    );
  });

  it("blocks a plain member who neither created it nor is an admin/owner (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "member",
    } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(contactRow as never);

    await expect(deleteContact("contact_1")).rejects.toThrow(ForbiddenError);
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });

  it("lets an admin delete a contact they didn't create", async () => {
    vi.mocked(requireMember).mockResolvedValue({
      id: "cmember0000000000002",
      householdId: "household_1",
      role: "admin",
    } as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(contactRow as never);

    await expect(deleteContact("contact_1")).resolves.toBeUndefined();
    expect(prisma.contact.delete).toHaveBeenCalled();
  });
});
