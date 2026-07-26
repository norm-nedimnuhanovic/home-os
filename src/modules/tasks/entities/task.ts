import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";
// Imported directly from reminders' own entity file, never the
// @/modules/reminders barrel — this file is part of task-form.tsx's
// ("use client") import graph, and the barrel's createReminder() export
// transitively reaches src/lib/email/send-category-email.tsx ("server-only").
// A client-reachable import pulling that in via a barrel is exactly the
// build-breaking gotcha documented in docs/project-structure.md §7 (found
// during Dashboard's own build) — entities/reminder.ts itself has zero
// dependencies beyond zod, so importing it directly is safe.
import { leadTimeUnitSchema } from "@/modules/reminders/entities/reminder";

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const createTaskInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    dueDate: z.date().optional(),
    dueDateAllDay: z.boolean().default(true),
    priority: taskPrioritySchema.default("medium"),
    assigneeId: z.string().cuid().optional(),
    parentTaskId: z.string().cuid().optional(),
    tagIds: z.array(z.string().cuid()).default([]),
    // Opt-in "remind me before due date" (task.due_soon, docs/email.md §2.2)
    // — a Reminder is created/regenerated from these, never persisted as
    // Task columns themselves (Reminder already owns leadTimeValue/Unit).
    remindBeforeDue: z.boolean().default(false),
    remindLeadTimeValue: z.number().int().min(1).default(1),
    remindLeadTimeUnit: leadTimeUnitSchema.default("days"),
    ...visibilitySchemaFields,
  })
  .superRefine((data, ctx) => {
    refineVisibility(data, ctx);
    if (data.remindBeforeDue && !data.dueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remindBeforeDue"],
        message: "Set a due date to enable this reminder.",
      });
    }
  });
// The *output* type (after zod's .default()s are applied) — what a Server
// Action receives once it re-parses input with .parse(). Do not use this
// for a react-hook-form generic; see CreateTaskFormInput below.
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
// The *input* type (before defaults are applied, so every defaulted field
// is optional) — what zodResolver()/react-hook-form actually expect a form
// component's values to look like pre-submit.
export type CreateTaskFormInput = z.input<typeof createTaskInputSchema>;

// updateTask reuses createTaskInputSchema (docs/forms.md §1): the edit form
// is always pre-filled with the task's full current values, so an update is
// a full replace, not a partial patch — no separate all-optional schema.

// completedAt is the single source of truth for completion — no separate
// boolean (plan.md §3.2).
export function getTaskStatus(task: {
  completedAt: Date | null;
  dueDate: Date | null;
}): "open" | "overdue" | "completed" {
  if (task.completedAt) return "completed";
  if (task.dueDate && task.dueDate < new Date()) return "overdue";
  return "open";
}
