import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendCategoryEmail, sendHouseholdInviteEmail } from "./send-category-email";
import { sendTransactionalEmail } from "./resend-client";
import { prisma } from "@/lib/db";
import { ReminderFiringEmail } from "./templates/reminder-firing";
import { BillDueSoonEmail } from "./templates/bill-due-soon";
import { TaskAssignedEmail } from "./templates/task-assigned";
import { ShareReceivedEmail } from "./templates/share-received";
import { HouseholdInviteReceivedEmail } from "./templates/household-invite-received";

vi.mock("./resend-client", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    member: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    task: { findUniqueOrThrow: vi.fn() },
  },
}));

const seededMember = { id: "member_1", email: "sam@seed.local", displayName: "Sam" };

describe("sendCategoryEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.member.findUniqueOrThrow).mockResolvedValue(seededMember as never);
  });

  it("uses ReminderFiringEmail for a non-subscription-sourced firing reminder", async () => {
    const reminder = { title: "Water the plants", description: null, sourceType: "manual" };
    await sendCategoryEmail({ reminder, occurrence: { id: "occ_1" } } as never, "member_1", "reminder.due");

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sam@seed.local",
        react: expect.objectContaining({ type: ReminderFiringEmail }),
      }),
    );
  });

  it("uses BillDueSoonEmail for a subscription-sourced firing reminder", async () => {
    const reminder = { title: "Netflix is due soon", description: null, sourceType: "subscription" };
    await sendCategoryEmail({ reminder, occurrence: { id: "occ_1" } } as never, "member_1", "bill.due_soon");

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ react: expect.objectContaining({ type: BillDueSoonEmail }) }),
    );
  });

  it("fetches the Task and assigner for task.assigned", async () => {
    vi.mocked(prisma.task.findUniqueOrThrow).mockResolvedValue({ id: "task_1", title: "Take out the bins" } as never);
    vi.mocked(prisma.member.findUnique).mockResolvedValue({ displayName: "Alex" } as never);

    await sendCategoryEmail({ taskId: "task_1", triggeredByMemberId: "member_2" }, "member_1", "task.assigned");

    expect(prisma.task.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "task_1" } });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ react: expect.objectContaining({ type: TaskAssignedEmail, props: expect.objectContaining({ assignedByName: "Alex" }) }) }),
    );
  });

  it("fetches the sharing member for share.received", async () => {
    vi.mocked(prisma.member.findUniqueOrThrow)
      .mockResolvedValueOnce(seededMember as never) // recipient
      .mockResolvedValueOnce({ displayName: "Jamie" } as never); // sharer

    await sendCategoryEmail({ objectType: "Task", sharedByMemberId: "member_2" }, "member_1", "share.received");

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ react: expect.objectContaining({ type: ShareReceivedEmail, props: expect.objectContaining({ sharedByName: "Jamie" }) }) }),
    );
  });

  it("throws for a categoryKey with no registered template", async () => {
    await expect(sendCategoryEmail({}, "member_1", "unknown.category")).rejects.toThrow(
      'No email template registered for categoryKey "unknown.category"',
    );
  });
});

describe("sendHouseholdInviteEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends directly, bypassing the memberId/categoryKey lookup", async () => {
    await sendHouseholdInviteEmail({
      to: "invitee@example.com",
      householdName: "The Rivera Household",
      invitedByName: "Sam",
      acceptUrl: "https://example.com/invite/abc123",
    });

    expect(prisma.member.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "invitee@example.com",
        react: expect.objectContaining({ type: HouseholdInviteReceivedEmail }),
      }),
    );
  });
});
