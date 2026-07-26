import { beforeEach, describe, expect, it, vi } from "vitest";
import { toggleContactPin } from "./toggle-contact-pin";
import { requireMember } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/access/errors";

vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findFirst: vi.fn(), update: vi.fn() },
    objectShare: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireMember: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actingMember = { id: "cmember0000000000001", householdId: "household_1", role: "member" as const };

describe("toggleContactPin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pins a visible contact (happy path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: "contact_1" } as never);
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: "contact_1", isPinned: true } as never);

    await toggleContactPin("contact_1", true);

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPinned: true } }),
    );
  });

  it("rejects when the contact isn't visible to the acting member (rejected path)", async () => {
    vi.mocked(requireMember).mockResolvedValue(actingMember as never);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);

    await expect(toggleContactPin("contact_1", true)).rejects.toThrow(NotFoundError);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});
