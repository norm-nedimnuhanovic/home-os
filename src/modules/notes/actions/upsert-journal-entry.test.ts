import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertJournalEntry } from "./upsert-journal-entry";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { note: { upsert: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("upsertJournalEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts by (authorMemberId, entryDate), always private, always journal (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.note.upsert).mockResolvedValue({ id: "note_1" } as never);

    const entryDate = new Date("2026-08-01");
    await upsertJournalEntry({ body: "Today was good.", entryDate });

    expect(prisma.note.upsert).toHaveBeenCalledWith({
      where: {
        one_journal_entry_per_member_per_day: { authorMemberId: "member_1", entryDate },
        householdId: "household_1",
      },
      update: { body: "Today was good." },
      create: expect.objectContaining({
        householdId: "household_1",
        authorMemberId: "member_1",
        noteType: "journal",
        entryDate,
        visibility: "private",
      }),
    });
  });

  it("rejects when there's no authenticated member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(
      upsertJournalEntry({ body: "Today was good.", entryDate: new Date("2026-08-01") }),
    ).rejects.toThrow("Not authenticated");
    expect(prisma.note.upsert).not.toHaveBeenCalled();
  });
});
