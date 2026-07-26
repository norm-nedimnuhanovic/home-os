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

type NotificationDetail = {
  title: string;
  body: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
};

// The Notification row's title/body defaulted to the event type's own
// generic label with nothing else — "Task assigned" with no indication of
// *which* task or who assigned it. `Notification.sourceEntityType`/
// `sourceEntityId`/`body` already existed in the schema for exactly this,
// just never populated. One lookup per category, falling back to the
// generic label if the source row can't be resolved (deleted since, a
// stale/malformed payload, etc.) rather than erroring the whole fan-out.
async function buildNotificationDetail(
  occurrence: Occurrence,
  payload: Record<string, unknown>,
): Promise<NotificationDetail> {
  const generic = { title: occurrence.eventType.label, body: null, sourceEntityType: null, sourceEntityId: null };

  if (occurrence.eventType.key === "task.assigned") {
    const taskId = payload.taskId as string | undefined;
    if (!taskId) return generic;
    const [task, assigner] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId, householdId: occurrence.householdId }, select: { title: true } }),
      occurrence.triggeredByMemberId
        ? prisma.member.findUnique({
            where: { id: occurrence.triggeredByMemberId, householdId: occurrence.householdId },
            select: { displayName: true },
          })
        : null,
    ]);
    return {
      title: occurrence.eventType.label,
      body: task ? `${assigner ? `${assigner.displayName} assigned` : "Assigned"} you "${task.title}"` : null,
      sourceEntityType: "Task",
      sourceEntityId: taskId,
    };
  }

  if (occurrence.eventType.key === "share.received") {
    const objectType = payload.objectType as string | undefined;
    const objectId = payload.objectId as string | undefined;
    const sharedByMemberId = payload.sharedByMemberId as string | undefined;
    const sharer = sharedByMemberId
      ? await prisma.member.findUnique({
          where: { id: sharedByMemberId, householdId: occurrence.householdId },
          select: { displayName: true },
        })
      : null;
    return {
      title: occurrence.eventType.label,
      body: sharer && objectType ? `${sharer.displayName} shared a ${objectType} with you` : null,
      sourceEntityType: objectType ?? null,
      sourceEntityId: objectId ?? null,
    };
  }

  return generic;
}

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
    const detail = await buildNotificationDetail(occurrence, payload);
    await prisma.notification.create({
      data: {
        householdId: occurrence.householdId,
        memberId: recipientMemberId,
        categoryKey: occurrence.eventType.key,
        sourceModule: occurrence.eventType.key.split(".")[0],
        sourceEntityType: detail.sourceEntityType,
        sourceEntityId: detail.sourceEntityId,
        eventOccurrenceId: occurrence.id,
        title: detail.title,
        body: detail.body,
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
