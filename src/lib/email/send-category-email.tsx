import "server-only";
import type { Reminder, ReminderOccurrence } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "./resend-client";
import { ReminderFiringEmail, reminderFiringSubject } from "./templates/reminder-firing";
import { BillDueSoonEmail, billDueSoonSubject } from "./templates/bill-due-soon";
import { TaskAssignedEmail, taskAssignedSubject } from "./templates/task-assigned";
import { ShareReceivedEmail, shareReceivedSubject } from "./templates/share-received";
import {
  HouseholdInviteReceivedEmail,
  householdInviteReceivedSubject,
} from "./templates/household-invite-received";

type ReminderFiringContext = { reminder: Reminder; occurrence: ReminderOccurrence };

/**
 * Two calling conventions (docs/email.md §7.1):
 * - Reminder-backed categories (§2.2) pass `{ reminder, occurrence }` —
 *   already-hydrated rows from the reminders-sweep job, since it has them
 *   in hand and there's no reason to refetch.
 * - Notification-backed categories (§2.1) pass the EventOccurrence's own
 *   `payloadSnapshot`, plus `triggeredByMemberId` — this function fetches
 *   whatever else each specific template needs.
 */
export async function sendCategoryEmail(
  context: ReminderFiringContext | Record<string, unknown>,
  memberId: string,
  categoryKey: string,
) {
  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });

  if ("reminder" in context && context.reminder) {
    const { reminder } = context as ReminderFiringContext;
    if (reminder.sourceType === "subscription") {
      return sendTransactionalEmail({
        to: member.email,
        subject: billDueSoonSubject(reminder),
        react: <BillDueSoonEmail reminder={reminder} />,
      });
    }
    return sendTransactionalEmail({
      to: member.email,
      subject: reminderFiringSubject(reminder),
      react: <ReminderFiringEmail reminder={reminder} />,
    });
  }

  switch (categoryKey) {
    case "task.assigned": {
      const { taskId, triggeredByMemberId } = context as { taskId: string; triggeredByMemberId: string | null };
      const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      const assignedBy = triggeredByMemberId
        ? await prisma.member.findUnique({ where: { id: triggeredByMemberId } })
        : null;
      return sendTransactionalEmail({
        to: member.email,
        subject: taskAssignedSubject(),
        react: <TaskAssignedEmail taskTitle={task.title} assignedByName={assignedBy?.displayName ?? "Someone"} />,
      });
    }
    case "share.received": {
      const { objectType, sharedByMemberId } = context as { objectType: string; sharedByMemberId: string };
      const sharedBy = await prisma.member.findUniqueOrThrow({ where: { id: sharedByMemberId } });
      return sendTransactionalEmail({
        to: member.email,
        subject: shareReceivedSubject(),
        react: <ShareReceivedEmail objectType={objectType} sharedByName={sharedBy.displayName} />,
      });
    }
    default:
      throw new Error(`No email template registered for categoryKey "${categoryKey}"`);
  }
}

// Bypasses the memberId/categoryKey contract above entirely — an invited
// email address has no Member row yet, so there's no NotificationPreference
// to gate on and no member.email to look up. Called directly from
// inviteMember() (settings/members/actions.ts), never through
// fanOutNotificationsForOccurrence (docs/email.md §2.1).
export async function sendHouseholdInviteEmail(input: {
  to: string;
  householdName: string;
  invitedByName: string;
  acceptUrl: string;
}) {
  return sendTransactionalEmail({
    to: input.to,
    subject: householdInviteReceivedSubject(input.householdName),
    react: (
      <HouseholdInviteReceivedEmail
        householdName={input.householdName}
        invitedByName={input.invitedByName}
        acceptUrl={input.acceptUrl}
      />
    ),
  });
}
