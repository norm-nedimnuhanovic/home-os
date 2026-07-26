import { z } from "zod";

export const reminderTypeSchema = z.enum(["one_off", "recurring"]);
export const reminderSourceTypeSchema = z.enum([
  "manual",
  "task",
  "subscription",
  "renewal",
  "document",
  "budget",
  "other",
]);
export const leadTimeUnitSchema = z.enum(["minutes", "hours", "days", "weeks"]);
export const recurrenceFrequencySchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

function refineRecurrenceAndEndDate(
  data: {
    reminderType: string;
    recurrenceFrequency?: string;
    recurrenceEndDate?: Date;
    firstRemindAt: Date;
  },
  ctx: z.RefinementCtx,
) {
  if (data.reminderType === "recurring" && !data.recurrenceFrequency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceFrequency"],
      message: "Required for a recurring reminder.",
    });
  }
  if (data.recurrenceEndDate && data.recurrenceEndDate <= data.firstRemindAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceEndDate"],
      message: "Must be after the first reminder.",
    });
  }
}

// The full, internal contract createReminder() (the shared platform
// capability, docs/recipes.md §4.3) accepts — called both by
// create-manual-reminder.ts (a thin, auth-checked wrapper for the UI) and
// directly by other modules' sweep jobs, which have no acting
// member/session at all. Never wire this schema/action directly to a
// client-facing form — householdId/createdByMemberId must come from a
// resolved session, never a client-supplied field.
export const reminderInputSchema = z
  .object({
    householdId: z.string().cuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    targetMemberId: z.string().cuid(),
    createdByMemberId: z.string().cuid(),
    sourceType: reminderSourceTypeSchema.default("manual"),
    sourceModule: z.string().optional(),
    sourceEntityId: z.string().optional(),
    reminderType: reminderTypeSchema.default("one_off"),
    firstRemindAt: z.date(),
    leadTimeValue: z.number().int().positive().optional(),
    leadTimeUnit: leadTimeUnitSchema.optional(),
    recurrenceFrequency: recurrenceFrequencySchema.optional(),
    recurrenceInterval: z.number().int().min(1).default(1),
    recurrenceDaysOfWeek: z.string().optional(),
    recurrenceEndDate: z.date().optional(),
    recurrenceCount: z.number().int().min(1).optional(),
    emailEnabled: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    refineRecurrenceAndEndDate(data, ctx);
    if (data.sourceType !== "manual" && !data.sourceModule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceModule"],
        message: "Required when sourceType isn't manual.",
      });
    }
  });
// The *output* type (after zod's .default()s are applied) — what
// createReminder() gets back from .parse(). Do not use this for the
// function's own parameter type; see ReminderInputArgs below (the same
// z.input vs z.output distinction docs/forms.md's Task example already
// establishes for react-hook-form — it applies here too, since callers of
// createReminder() shouldn't have to pass already-defaulted fields either).
export type ReminderInput = z.infer<typeof reminderInputSchema>;
// The *input* type (before defaults are applied) — what createReminder()'s
// callers (create-manual-reminder.ts, other modules' cron jobs) actually
// pass: every defaulted field (reminderType, recurrenceInterval,
// emailEnabled, sourceType) is optional.
export type ReminderInputArgs = z.input<typeof reminderInputSchema>;

// The manual/UI-facing subset — no householdId/createdByMemberId/sourceType,
// which create-manual-reminder.ts resolves server-side and never takes from
// the client. Reused for update (docs/forms.md §1's established convention):
// the edit form is always pre-filled with the reminder's full current
// values, so an update is a full replace.
export const createManualReminderInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    targetMemberId: z.string().cuid(),
    reminderType: reminderTypeSchema.default("one_off"),
    firstRemindAt: z.date(),
    recurrenceFrequency: recurrenceFrequencySchema.optional(),
    recurrenceInterval: z.number().int().min(1).default(1),
    recurrenceEndDate: z.date().optional(),
    emailEnabled: z.boolean().default(true),
  })
  .superRefine(refineRecurrenceAndEndDate);
export type CreateManualReminderInput = z.infer<typeof createManualReminderInputSchema>;
export type CreateManualReminderFormInput = z.input<typeof createManualReminderInputSchema>;
