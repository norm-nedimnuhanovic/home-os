import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getNote } from "./get-note";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    note: { findFirst: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getNote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the lookup by visibility and id — loading it at all is the auth check", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.note.findFirst).mockResolvedValue({ id: "note_1" } as never);

    const result = await getNote(actingMember as never, "note_1");

    expect(prisma.note.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [expect.objectContaining({ householdId: "household_1" }), { id: "note_1" }],
        },
      }),
    );
    expect(result).toEqual({ id: "note_1" });
  });

  it("throws NotFoundError when the note isn't visible to the acting member", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.note.findFirst).mockResolvedValue(null);

    await expect(getNote(actingMember as never, "note_missing")).rejects.toThrow(NotFoundError);
  });
});
