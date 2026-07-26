import { beforeEach, describe, expect, it, vi } from "vitest";
import { unlinkNote } from "./unlink-note";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getNote } from "../queries/get-note";

vi.mock("@/lib/db", () => ({
  prisma: {
    noteLink: { findFirst: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-note", () => ({ getNote: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("unlinkNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the link when the acting member is the note's author (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getNote).mockResolvedValue({
      id: "note_1",
      householdId: "household_1",
      authorMemberId: "member_1",
    } as never);
    vi.mocked(prisma.noteLink.findFirst).mockResolvedValue({ id: "link_1" } as never);

    await unlinkNote("note_1", "link_1");

    expect(prisma.noteLink.delete).toHaveBeenCalledWith({
      where: { id: "link_1", householdId: "household_1" },
    });
  });

  it("rejects when the acting member isn't the note's author (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getNote).mockResolvedValue({
      id: "note_1",
      householdId: "household_1",
      authorMemberId: "cmember0000000000002",
    } as never);

    await expect(unlinkNote("note_1", "link_1")).rejects.toThrow(
      "Only the note's author can remove a link.",
    );
    expect(prisma.noteLink.delete).not.toHaveBeenCalled();
  });
});
