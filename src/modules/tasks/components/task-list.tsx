"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { formatInHouseholdTimezone } from "@/lib/dates";
import { getTaskStatus } from "../entities/task";
import { completeTask } from "../actions/complete-task";
import { TaskRowActions } from "./task-row-actions";
import type { Task } from "@prisma/client";

type MemberOption = { id: string; displayName: string };
type TagOption = { id: string; name: string };
type DueReminder = { leadTimeValue: number | null; leadTimeUnit: "minutes" | "hours" | "days" | "weeks" | null };

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  overdue: "Overdue",
  completed: "Completed",
};

type TaskRow = Task & {
  assignee?: { displayName: string } | null;
  tagIds?: string[];
  dueReminder?: DueReminder | null;
};

export function TaskList({
  tasks,
  householdTimezone,
  members,
  tags,
}: {
  tasks: TaskRow[];
  householdTimezone: string;
  members: MemberOption[];
  tags: TagOption[];
}) {
  const { isPending, run } = useActionFeedback();

  if (tasks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No tasks yet — add one to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => {
        const status = getTaskStatus(task);
        return (
          <li
            key={task.id}
            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Checkbox
                checked={status === "completed"}
                disabled={status === "completed" || isPending}
                onCheckedChange={() => run(() => completeTask(task.id))}
                className="mt-1 shrink-0"
                aria-label={`Mark "${task.title}" complete`}
              />
              <div className="min-w-0">
                <p
                  className={
                    status === "completed" ? "truncate line-through text-muted-foreground" : "truncate"
                  }
                >
                  {task.title}
                </p>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground">
                    Due {formatInHouseholdTimezone(task.dueDate, householdTimezone)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"}>{task.priority}</Badge>
              {status === "overdue" && <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>}
              {task.assignee && (
                <span className="text-xs text-muted-foreground">{task.assignee.displayName}</span>
              )}
              <TaskRowActions task={task} members={members} tags={tags} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
