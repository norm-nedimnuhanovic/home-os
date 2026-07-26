import { prisma } from "@/lib/db";
import { getEffectivePreference } from "./entities/notification-preference";
import { sendCategoryEmail } from "@/lib/email/send-category-email";
import type { EventOccurrence, ModuleEventType } from "@prisma/client";

type Occurrence = EventOccurrence & { eventType: ModuleEventType };

// One row per member per Notification-backed category firing
// (docs/email.md §2.1, §4) — the categories that have no Reminder in their
// path, so Notification is the only in-app surface for them. Each entry
// resolves who the recipient(s) are from the event's own payload shape,
// since EventOccurrence has no generic "recipient" concept — see
// docs/module-architecture.md §4.1's payloadSummary convention per event
// type.
const NOTIFICATION_BACKED_RECIPIENTS: Record<
  string,
  (payload: Record<string, unknown>) => string | null
> = {
  "task.assigned": (payload) => (payload.assigneeId as string | undefined) ?? null,
  "share.received": (payload) => (payload.sharedWithMemberId as string | undefined) ?? null,
  "household.invite_received": (payload) => (payload.invitedMemberId as string | undefined) ?? null,
};

/**
 * Baseline platform behavior — every EventOccurrence gets the
 * Notification/email fan-out for its categoryKey for free, gated only by
 * NotificationPreference. This is NOT an EventSubscription and no module
 * opts into it by registering one (docs/module-architecture.md §6.2,
 * docs/seeding.md §5.4's framing).
 *
 * Only categories in NOTIFICATION_BACKED_RECIPIENTS write a Notification
 * row — Reminder-backed categories (docs/email.md §2.2) surface in-app via
 * ReminderOccurrence instead and are never routed through here.
 */
export async function fanOutNotificationsForOccurrence(occurrence: Occurrence) {
  const resolveRecipient = NOTIFICATION_BACKED_RECIPIENTS[occurrence.eventType.key];
  if (!resolveRecipient) return; // not a Notification-backed category — nothing to do here

  const payload = occurrence.payloadSnapshot as unknown as Record<string, unknown>;
  const recipientMemberId = resolveRecipient(payload);
  if (!recipientMemberId) return;

  const preference = await getEffectivePreference(occurrence.householdId, recipientMemberId, occurrence.eventType.key);

  if (preference.inAppEnabled) {
    await prisma.notification.create({
      data: {
        householdId: occurrence.householdId,
        memberId: recipientMemberId,
        categoryKey: occurrence.eventType.key,
        sourceModule: occurrence.eventType.key.split(".")[0],
        eventOccurrenceId: occurrence.id,
        title: occurrence.eventType.label,
      },
    });
  }

  if (preference.emailEnabled) {
    // Best-effort — a Resend outage/misconfiguration must never break the
    // action that triggered this event (task creation, sharing, etc.).
    // fanOutNotificationsForOccurrence() is called unconditionally from
    // dispatchToSubscribers() for every emitEvent() call in the app, so an
    // uncaught throw here would take down completely unrelated features.
    try {
      await sendCategoryEmail(
        { ...payload, triggeredByMemberId: occurrence.triggeredByMemberId },
        recipientMemberId,
        occurrence.eventType.key,
      );
    } catch (error) {
      console.error(`Failed to send ${occurrence.eventType.key} email to member ${recipientMemberId}:`, error);
    }
  }
}
