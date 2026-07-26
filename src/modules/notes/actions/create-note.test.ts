import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNote } from "./create-note";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { emitNoteCreated } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { note: { create: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../events/emitters", () => ({ emitNoteCreated: vi.fn() }));
vi.mock("@/lib/household/actions/sync-object-shares", () => ({ syncObjectShares: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("createNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a standard note scoped to the acting member's household (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(prisma.note.create).mockResolvedValue({ id: "note_1" } as never);

    await createNote({ body: "Some thoughts." });

    expect(prisma.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "household_1",
          authorMemberId: "member_1",
          noteType: "standard",
          body: "Some thoughts.",
        }),
      }),
    );
    expect(emitNoteCreated).toHaveBeenCalledWith("household_1", "note_1", "member_1");
  });

  it("rejects an empty body before ever calling prisma.note.create (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);

    await expect(createNote({ body: "" })).rejects.toThrow();
    expect(prisma.note.create).not.toHaveBeenCalled();
  });

  it("rejects when there's no authenticated member", async () => {
    vi.mocked(requireMember).mockResolvedValue(null);

    await expect(createNote({ body: "Some thoughts." })).rejects.toThrow("Not authenticated");
    expect(prisma.note.create).not.toHaveBeenCalled();
  });
});
