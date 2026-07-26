import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateNote } from "./update-note";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getNote } from "../queries/get-note";

vi.mock("@/lib/db", () => ({
  prisma: { note: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-note", () => ({ getNote: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("updateNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the note when the acting member is its author (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getNote).mockResolvedValue({
      id: "note_1",
      householdId: "household_1",
      authorMemberId: "member_1",
    } as never);
    vi.mocked(prisma.note.update).mockResolvedValue({ id: "note_1" } as never);

    await updateNote("note_1", { body: "Updated thoughts." });

    expect(prisma.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note_1", householdId: "household_1" },
        data: expect.objectContaining({ body: "Updated thoughts." }),
      }),
    );
  });

  it("rejects when the acting member isn't the note's author (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getNote).mockResolvedValue({
      id: "note_1",
      householdId: "household_1",
      authorMemberId: "cmember0000000000002",
    } as never);

    await expect(updateNote("note_1", { body: "Updated thoughts." })).rejects.toThrow(
      "Only the note's author can edit it.",
    );
    expect(prisma.note.update).not.toHaveBeenCalled();
  });
});
