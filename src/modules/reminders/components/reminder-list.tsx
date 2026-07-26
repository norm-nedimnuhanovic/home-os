"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getOccurrenceStatus } from "../entities/occurrence-status";
import { cancelReminder } from "../actions/cancel-reminder";
import { OccurrenceActions } from "./occurrence-actions";
import type { Reminder, ReminderOccurrence } from "@prisma/client";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  due: "destructive",
  upcoming: "secondary",
  notified: "destructive",
  snoozed: "outline",
  dismissed: "outline",
  completed: "outline",
  missed: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  due: "Due now",
  upcoming: "Upcoming",
  notified: "Due now",
  snoozed: "Snoozed",
  dismissed: "Dismissed",
  completed: "Completed",
  missed: "Missed",
};

type ReminderRow = Reminder & {
  targetMember: { displayName: string };
  occurrences: ReminderOccurrence[];
};

export function ReminderList({
  reminders,
  actingMemberId,
}: {
  reminders: ReminderRow[];
  actingMemberId: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (reminders.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No reminders yet — add one to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {reminders.map((reminder) => {
        const occurrence = reminder.occurrences[0];
        const status = occurrence ? getOccurrenceStatus(occurrence) : null;
        const isTarget = reminder.targetMemberId === actingMemberId;
        const isOwner = reminder.createdByMemberId === actingMemberId;
        const isActionable = isTarget && occurrence && ["due", "upcoming", "notified", "snoozed"].includes(status ?? "");

        return (
          <li key={reminder.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{reminder.title}</p>
                <p className="text-xs text-muted-foreground">
                  For {reminder.targetMember.displayName}
                  {occurrence &&
                    ` · ${format(status === "snoozed" && occurrence.snoozedUntil ? occurrence.snoozedUntil : occurrence.remindAt, "PPp")}`}
                  {reminder.reminderType === "recurring" && ` · Repeats ${reminder.recurrenceFrequency}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {reminder.status === "cancelled" ? (
                  <Badge variant="outline">Cancelled</Badge>
                ) : (
                  status && <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status]}</Badge>
                )}
              </div>
            </div>

            {isActionable && <OccurrenceActions occurrenceId={occurrence.id} />}

            {(isOwner || isTarget) && reminder.status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                className="w-full self-start sm:w-auto"
                onClick={() =>
                  startTransition(async () => {
                    await cancelReminder(reminder.id);
                  })
                }
              >
                Cancel reminder
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
