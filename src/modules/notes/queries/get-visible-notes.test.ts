import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getVisibleNotes } from "./get-visible-notes";

vi.mock("@/lib/db", () => ({
  prisma: {
    objectShare: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
  },
}));

const actingMember = { id: "member_1", householdId: "household_1" };

describe("getVisibleNotes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by visibility and excludes archived notes by default", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.note.findMany).mockResolvedValue([{ id: "note_1" }] as never);

    const result = await getVisibleNotes(actingMember as never);

    expect(prisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [expect.objectContaining({ householdId: "household_1" }), { isArchived: false }],
        },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("filters by noteType and tagId when provided", async () => {
    vi.mocked(prisma.objectShare.findMany).mockResolvedValue([]);
    vi.mocked(prisma.note.findMany).mockResolvedValue([]);

    await getVisibleNotes(actingMember as never, { noteType: "journal", tagId: "tag_1" });

    expect(prisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.any(Object),
            { noteType: "journal", isArchived: false, tags: { some: { tagId: "tag_1" } } },
          ],
        },
      }),
    );
  });
});
