import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkNote } from "./link-note";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getNote } from "../queries/get-note";
import { emitNoteLinked } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { noteLink: { create: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-note", () => ({ getNote: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitNoteLinked: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("linkNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links the note to a task when the acting member is its author (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getNote).mockResolvedValue({
      id: "note_1",
      householdId: "household_1",
      authorMemberId: "member_1",
    } as never);
    vi.mocked(prisma.noteLink.create).mockResolvedValue({ id: "link_1" } as never);

    await linkNote("note_1", {
      linkedEntityModule: "tasks",
      linkedEntityType: "task",
      linkedEntityId: "ctask00000000000001",
    });

    expect(prisma.noteLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          noteId: "note_1",
          linkedEntityType: "task",
          linkedTaskId: "ctask00000000000001",
        }),
      }),
    );
    expect(emitNoteLinked).toHaveBeenCalledWith(
      "household_1",
      "note_1",
      "task",
      "ctask00000000000001",
      "member_1",
    );
  });

  it("rejects when the acting member isn't the note's author (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getNote).mockResolvedValue({
      id: "note_1",
      householdId: "household_1",
      authorMemberId: "cmember0000000000002",
    } as never);

    await expect(
      linkNote("note_1", {
        linkedEntityModule: "tasks",
        linkedEntityType: "task",
        linkedEntityId: "ctask00000000000001",
      }),
    ).rejects.toThrow("Only the note's author can link it.");
    expect(prisma.noteLink.create).not.toHaveBeenCalled();
  });
});
