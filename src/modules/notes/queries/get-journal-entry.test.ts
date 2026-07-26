import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getJournalEntry } from "./get-journal-entry";

vi.mock("@/lib/db", () => ({
  prisma: { note: { findFirst: vi.fn() } },
}));

describe("getJournalEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes by householdId, authorMemberId, noteType, and the exact entryDate", async () => {
    vi.mocked(prisma.note.findFirst).mockResolvedValue({ id: "note_1" } as never);
    const entryDate = new Date("2026-08-01");

    const result = await getJournalEntry("household_1", "member_1", entryDate);

    expect(prisma.note.findFirst).toHaveBeenCalledWith({
      where: { householdId: "household_1", authorMemberId: "member_1", noteType: "journal", entryDate },
    });
    expect(result).toEqual({ id: "note_1" });
  });
});
