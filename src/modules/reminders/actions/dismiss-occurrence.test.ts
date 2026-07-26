import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismissOccurrence } from "./dismiss-occurrence";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getOccurrence } from "../queries/get-occurrence";
import { generateNextOccurrenceIfDue } from "./generate-next-occurrence";

vi.mock("@/lib/db", () => ({
  prisma: { reminderOccurrence: { update: vi.fn() } },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("../queries/get-occurrence", () => ({ getOccurrence: vi.fn() }));
vi.mock("./generate-next-occurrence", () => ({ generateNextOccurrenceIfDue: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const seededMember = {
  id: "member_1",
  householdId: "household_1",
  role: "member" as const,
  status: "active" as const,
  displayName: "Sam",
};

describe("dismissOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismisses the occurrence when the acting member is its reminder's target (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    const reminder = { targetMemberId: "member_1" };
    vi.mocked(getOccurrence).mockResolvedValue({
      id: "occ_1",
      householdId: "household_1",
      reminder,
    } as never);
    vi.mocked(prisma.reminderOccurrence.update).mockResolvedValue({ id: "occ_1" } as never);

    await dismissOccurrence("occ_1");

    expect(prisma.reminderOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ_1", householdId: "household_1" },
      data: { status: "dismissed", acknowledgedAt: expect.any(Date) },
    });
    expect(generateNextOccurrenceIfDue).toHaveBeenCalledWith(reminder, { id: "occ_1" });
  });

  it("rejects when the acting member isn't this reminder's target (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(seededMember as never);
    vi.mocked(getOccurrence).mockResolvedValue({
      id: "occ_1",
      householdId: "household_1",
      reminder: { targetMemberId: "cmember0000000000002" },
    } as never);

    await expect(dismissOccurrence("occ_1")).rejects.toThrow("Only this reminder's target can dismiss it.");
    expect(prisma.reminderOccurrence.update).not.toHaveBeenCalled();
  });
});
