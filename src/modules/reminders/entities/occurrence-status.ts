// pending → notified happens via the reminders-sweep cron job
// (src/modules/reminders/jobs/sweep-due-occurrences.ts, plan.md §4.5,
// ROADMAP.md §8), which runs at most every 15 minutes — so a pending
// occurrence whose remindAt has already passed but hasn't been swept yet
// still needs to read as actionable in the UI. "due" is computed here
// instead of waiting on the next sweep tick, the same derive-don't-store
// principle as Task's getTaskStatus().
export type ComputedOccurrenceStatus =
  | "upcoming"
  | "due"
  | "notified"
  | "snoozed"
  | "dismissed"
  | "completed"
  | "missed";

export function getOccurrenceStatus(occurrence: {
  status: string;
  remindAt: Date;
}): ComputedOccurrenceStatus {
  if (occurrence.status === "pending") {
    return occurrence.remindAt <= new Date() ? "due" : "upcoming";
  }
  return occurrence.status as ComputedOccurrenceStatus;
}
