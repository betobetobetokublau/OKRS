import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  full_name: z.string().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  role: z.enum(['admin', 'manager', 'member']).default('member'),
  department_ids: z.array(z.string().uuid()).optional(),
  workspace_id: z.string().uuid(),
});

export const changePasswordSchema = z.object({
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
