import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleContacts } from "./get-visible-contacts";

vi.mock("@/lib/db", () => ({
  prisma: { contact: { findMany: vi.fn() }, objectShare: { findMany: vi.fn() } },
}));

const actingMember = { id: "cmember0000000000001", householdId: "household_1" };

describe("getVisibleContacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId and includes the visibility clause", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([{ id: "contact_1" }] as never);

    const result = await getVisibleContacts(actingMember as never);

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ householdId: "household_1" })]),
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("applies a category filter when provided", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);

    await getVisibleContacts(actingMember as never, { category: "medical" });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expect.objectContaining({ category: "medical" })]),
        }),
      }),
    );
  });
});
