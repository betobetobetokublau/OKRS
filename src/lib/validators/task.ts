import { z } from 'zod';

export const taskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(1000, 'Máximo 1000 caracteres').nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).default('pending'),
  block_reason: z.string().max(500).nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  objective_id: z.string().uuid(),
});

export type TaskFormData = z.infer<typeof taskSchema>;
