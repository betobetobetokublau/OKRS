import { z } from 'zod';

export const kpiSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(1000, 'Máximo 1000 caracteres').nullable().optional(),
  progress_mode: z.enum(['manual', 'auto', 'hybrid']).default('hybrid'),
  manual_progress: z.number().min(0).max(100).default(0),
  responsible_user_id: z.string().uuid().nullable().optional(),
  responsible_department_id: z.string().uuid().nullable().optional(),
  period_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  department_ids: z.array(z.string().uuid()).optional(),
  objective_ids: z.array(z.string().uuid()).optional(),
});

export type KPIFormData = z.infer<typeof kpiSchema>;
