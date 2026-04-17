import { z } from 'zod';

export const exportQuarterlyApiSchema = z.object({
  workspace_id: z.string().uuid(),
  period_id: z.string().uuid(),
});

export type ExportQuarterlyApiInput = z.infer<typeof exportQuarterlyApiSchema>;
