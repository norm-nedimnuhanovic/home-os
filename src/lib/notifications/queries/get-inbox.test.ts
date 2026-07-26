import { describe, expect, it, vi } from "vitest";
import { getInbox } from "./get-inbox";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: { notification: { findMany: vi.fn() } },
}));

describe("getInbox", () => {
  it("scopes by householdId AND memberId, most recent first", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([{ id: "notif_1" }] as never);

    const result = await getInbox({ id: "member_1", householdId: "household_1" });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { householdId: "household_1", memberId: "member_1" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(result).toHaveLength(1);
  });
});
