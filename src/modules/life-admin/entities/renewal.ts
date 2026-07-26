import { z } from "zod";
import { visibilitySchemaFields, refineVisibility } from "@/lib/household/visibility";
import type { Renewal } from "@prisma/client";

export const renewalTypeSchema = z.enum([
  "warranty",
  "insurance",
  "registration_license",
  "membership_subscription",
  "certificate_id",
  "lease_contract",
  "domain_hosting",
  "other",
]);

export const renewalRecurrenceSchema = z.enum(["none", "monthly", "quarterly", "annual", "custom_interval"]);

export const createRenewalInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    type: renewalTypeSchema,
    provider: z.string().max(160).optional(),
    purchaseOrIssueDate: z.date().optional(),
    expiryDate: z.date(),
    // Household-level configurable default (plan.md §9 Q26) isn't modeled
    // yet — no schema field for it — so every Renewal defaults to the
    // Prisma column's own default([30]) and is overridable per record.
    reminderOffsetsDays: z.array(z.number().int().min(0)).min(1).default([30]),
    recurrence: renewalRecurrenceSchema.default("none"),
    responsibleMemberId: z.string().cuid().optional(),
    providerContactId: z.string().cuid().optional(),
    ...visibilitySchemaFields,
  })
  .superRefine(refineVisibility);
export type CreateRenewalInput = z.infer<typeof createRenewalInputSchema>;
export type CreateRenewalFormInput = z.input<typeof createRenewalInputSchema>;

// plan.md §9 Q29: always prompt for the new expiry date, never auto-advance
// by the recurrence interval.
export const markRenewedInputSchema = z.object({
  newExpiryDate: z.date(),
});
export type MarkRenewedInput = z.infer<typeof markRenewedInputSchema>;
export type MarkRenewedFormInput = z.input<typeof markRenewedInputSchema>;

export const RENEWAL_VISIBILITY_SCOPE = {
  moduleKey: "life_admin",
  objectType: "Renewal",
  ownerField: "createdById",
} as const;

export type RenewalLifecycleStatus = "active" | "expiring_soon" | "expired";

// Derive-don't-store, same ADR as Task's getTaskStatus()/Reminder's
// getOccurrenceStatus(): the stored `status` column only ever holds
// active/renewed/cancelled explicitly (createRenewal defaults to "active";
// markRenewed/cancelRenewal set the terminal values) — active/expiring_soon/
// expired are computed at read time from expiryDate + the earliest
// reminderOffsetsDays entry, never written back by a cron job. Q28's
// "auto-archive after a grace period" is implemented as a query-level filter
// (get-visible-renewals.ts), not a stored flag — see ROADMAP.md.
export function getRenewalLifecycleStatus(
  renewal: Pick<Renewal, "expiryDate" | "reminderOffsetsDays" | "status">,
  asOf: Date = new Date(),
): Renewal["status"] {
  if (renewal.status === "renewed" || renewal.status === "cancelled") return renewal.status;
  if (asOf > renewal.expiryDate) return "expired";
  const earliestOffsetDays = Math.min(...renewal.reminderOffsetsDays, 30);
  const windowStart = new Date(renewal.expiryDate);
  windowStart.setDate(windowStart.getDate() - earliestOffsetDays);
  if (asOf >= windowStart) return "expiring_soon";
  return "active";
}

export const EXPIRED_GRACE_PERIOD_DAYS = 30;
