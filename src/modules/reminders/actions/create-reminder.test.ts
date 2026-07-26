import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReminder } from "./create-reminder";
import { prisma } from "@/lib/db";
import { emitReminderCreated } from "../events/emitters";

vi.mock("@/lib/db", () => ({
  prisma: { reminder: { create: vi.fn() } },
}));
vi.mock("../events/emitters", () => ({ emitReminderCreated: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const base = {
  householdId: "chousehold000000000001",
  title: "Budget alert: Groceries is at 85%",
  targetMemberId: "cmember0000000000001",
  createdByMemberId: "cmember0000000000001",
  firstRemindAt: new Date("2026-08-01"),
};

describe("createReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a reminder and its first occurrence in one household, with no acting member needed (happy path — e.g. a cron sweep)", async () => {
    vi.mocked(prisma.reminder.create).mockResolvedValue({
      id: "reminder_1",
      occurrences: [{ id: "occ_1" }],
    } as never);

    await createReminder({ ...base, sourceType: "budget", sourceModule: "finance", sourceEntityId: "cbudget0000000000001" });

    expect(prisma.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          householdId: "chousehold000000000001",
          sourceType: "budget",
          sourceModule: "finance",
          sourceBudgetId: "cbudget0000000000001",
          occurrences: { create: { householdId: "chousehold000000000001", remindAt: base.firstRemindAt } },
        }),
      }),
    );
    expect(emitReminderCreated).toHaveBeenCalledWith("chousehold000000000001", "reminder_1", "cmember0000000000001");
  });

  it("rejects a non-manual sourceType with no sourceModule before ever calling prisma.reminder.create (rejected path)", async () => {
    await expect(createReminder({ ...base, sourceType: "budget" } as never)).rejects.toThrow();
    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  // Real bug, found via an actual browser test: these convenience FKs were
  // never set at all, so e.g. Task.reminders (a Prisma relation defined
  // through sourceTaskId) always came back empty regardless of sourceType.
  it.each([
    ["task", "sourceTaskId"],
    ["subscription", "sourceSubscriptionId"],
    ["renewal", "sourceRenewalId"],
    ["document", "sourceDocumentId"],
    ["budget", "sourceBudgetId"],
  ] as const)("sets %s's convenience FK (%s) alongside sourceEntityId", async (sourceType, fkField) => {
    vi.mocked(prisma.reminder.create).mockResolvedValue({ id: "reminder_1", occurrences: [] } as never);

    await createReminder({ ...base, sourceType, sourceModule: "some-module", sourceEntityId: "centity00000000000001" });

    expect(prisma.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ [fkField]: "centity00000000000001" }) }),
    );
  });

  it("sets no convenience FK for a manual reminder", async () => {
    vi.mocked(prisma.reminder.create).mockResolvedValue({ id: "reminder_1", occurrences: [] } as never);

    await createReminder({ ...base, sourceType: "manual" });

    const call = vi.mocked(prisma.reminder.create).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).not.toHaveProperty("sourceTaskId");
    expect(call.data).not.toHaveProperty("sourceSubscriptionId");
    expect(call.data).not.toHaveProperty("sourceRenewalId");
    expect(call.data).not.toHaveProperty("sourceDocumentId");
    expect(call.data).not.toHaveProperty("sourceBudgetId");
  });
});
