"use client";

import { addHours, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { snoozeOccurrence } from "../actions/snooze-occurrence";
import { dismissOccurrence } from "../actions/dismiss-occurrence";
import { completeOccurrence } from "../actions/complete-occurrence";

const SNOOZE_PRESETS = [
  { label: "1 hour", getDate: () => addHours(new Date(), 1) },
  { label: "Tomorrow", getDate: () => addDays(new Date(), 1) },
  { label: "Next week", getDate: () => addDays(new Date(), 7) },
];

export function OccurrenceActions({ occurrenceId }: { occurrenceId: string }) {
  const { isPending, run } = useActionFeedback();

  return (
    <div className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending} className="w-full sm:w-auto">
            Snooze
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SNOOZE_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              onClick={() => run(() => snoozeOccurrence(occurrenceId, preset.getDate()), "Reminder snoozed")}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        className="w-full sm:w-auto"
        onClick={() => run(() => completeOccurrence(occurrenceId), "Reminder completed")}
      >
        Complete
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        className="w-full sm:w-auto"
        onClick={() => run(() => dismissOccurrence(occurrenceId), "Reminder dismissed")}
      >
        Dismiss
      </Button>
    </div>
  );
}
