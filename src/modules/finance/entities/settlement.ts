import { z } from "zod";

export const createSettlementInputSchema = z
  .object({
    fromMemberId: z.string().cuid(),
    toMemberId: z.string().cuid(),
    amount: z.number().positive(),
    date: z.date().default(() => new Date()),
    method: z.string().max(80).optional(),
    note: z.string().max(2000).optional(),
    // The specific outstanding TransactionSplit rows this settlement
    // clears — omitted entirely means a free-standing balance adjustment
    // (plan.md §3.4).
    appliesToSplitIds: z.array(z.string().cuid()).default([]),
  })
  .refine((data) => data.fromMemberId !== data.toMemberId, {
    message: "A settlement must be between two different members.",
    path: ["toMemberId"],
  });
export type CreateSettlementInput = z.infer<typeof createSettlementInputSchema>;
export type CreateSettlementFormInput = z.input<typeof createSettlementInputSchema>;
