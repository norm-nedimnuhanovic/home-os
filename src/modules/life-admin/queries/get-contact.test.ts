import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getContact } from "./get-contact";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: { contact: { findFirst: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the contact when visibility permits it", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: "contact_1" } as never);

    const result = await getContact(actingMember as never, "contact_1");

    expect(result).toEqual({ id: "contact_1" });
    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ id: "contact_1" })]),
        }),
      }),
    );
  });

  it("throws NotFoundError when the contact doesn't exist or isn't visible", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);

    await expect(getContact(actingMember as never, "contact_missing")).rejects.toThrow(NotFoundError);
  });
});
