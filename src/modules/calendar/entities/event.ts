import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";

export const createEventInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    startAt: z.date(),
    endAt: z.date(),
    allDay: z.boolean().default(false),
    color: z.string().optional(),
    ...visibilitySchemaFields,
  })
  .superRefine((data, ctx) => {
    refineVisibility(data, ctx);
    if (data.endAt < data.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "End must be on or after the start.",
      });
    }
  });

// updateEvent reuses createEventInputSchema (docs/forms.md §1, same
// convention established for Task/KanbanBoard) — the edit form is always
// pre-filled with the event's full current values, so an update is a full
// replace.
export type CreateEventInput = z.infer<typeof createEventInputSchema>;
export type CreateEventFormInput = z.input<typeof createEventInputSchema>;
