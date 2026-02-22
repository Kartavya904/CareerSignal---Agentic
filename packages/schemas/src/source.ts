import { z } from 'zod';
import { sourceTypeEnum, sourceStatusEnum } from './enums';

export const sourceSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  blessed_source_id: z.string().uuid().optional(),
  name: z.string(),
  url: z.string().url(),
  type: sourceTypeEnum.default('CUSTOM'),
  enabled: z.boolean().default(true),
  is_blessed: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
  last_scanned_at: z.coerce.date().optional(),
  last_validated_at: z.coerce.date().optional(),
  status: sourceStatusEnum.default('ACTIVE'),
  corrected_url: z.string().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Source = z.infer<typeof sourceSchema>;

export const sourceInputSchema = sourceSchema.partial().required({
  name: true,
  url: true,
});
export type SourceInput = z.infer<typeof sourceInputSchema>;
