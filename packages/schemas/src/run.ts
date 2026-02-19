import { z } from 'zod';
import { runStatusEnum } from './enums';

export const runSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  status: runStatusEnum.default('PENDING'),
  started_at: z.coerce.date().optional(),
  finished_at: z.coerce.date().optional(),
  source_ids: z.array(z.string().uuid()).default([]),
  events: z.array(z.record(z.unknown())).optional(),
  error_message: z.string().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Run = z.infer<typeof runSchema>;

export const runInputSchema = z.object({
  source_ids: z.array(z.string().uuid()).optional().default([]),
});
export type RunInput = z.infer<typeof runInputSchema>;
