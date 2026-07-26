import { z } from "zod";

export const columnTypeSchema = z.enum(["todo", "in_progress", "done", "custom"]);

export const createColumnInputSchema = z.object({
  name: z.string().min(1).max(40),
  columnType: columnTypeSchema.default("custom"),
});
export type CreateColumnInput = z.infer<typeof createColumnInputSchema>;
export type CreateColumnFormInput = z.input<typeof createColumnInputSchema>;

export const moveCardInputSchema = z.object({
  taskId: z.string().cuid(),
  columnId: z.string().cuid(),
  boardPosition: z.number(),
});
export type MoveCardInput = z.infer<typeof moveCardInputSchema>;
