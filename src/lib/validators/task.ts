import { z } from 'zod';

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;

export const taskSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(1000, 'Máximo 1000 caracteres').nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).default('pending'),
  priority: z.enum(TASK_PRIORITIES).nullable().optional(),
  block_reason: z.string().max(500).nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  // Nullable since boards: a backlog idea may not hang off an OKR yet.
  objective_id: z.string().uuid().nullable().optional(),
  parent_task_id: z.string().uuid().nullable().optional(),
  workspace_id: z.string().uuid(),
});

export type TaskFormData = z.infer<typeof taskSchema>;
