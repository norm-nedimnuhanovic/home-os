import { z } from "zod";

export const createCardInputSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateCardInput = z.infer<typeof createCardInputSchema>;
