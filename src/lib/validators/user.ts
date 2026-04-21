import { z } from 'zod';

// Minimum initial-password length accepted by the admin-create-user flow.
// The matching user-initiated password-rotation form enforces a stricter 8+
// via `changePasswordSchema`.
export const API_MIN_PASSWORD_LEN = 6;

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

// Body accepted by POST /api/auth/crear-usuario. Superset of the form schema
// (adds the initial password + the flag that forces rotation on first login).
export const createUserApiSchema = createUserSchema.extend({
  password: z
    .string()
    .min(API_MIN_PASSWORD_LEN, `La contraseña debe tener al menos ${API_MIN_PASSWORD_LEN} caracteres`),
  must_change_password: z.boolean().default(true),
});

// Body accepted by POST /api/auth/cambiar-password-usuario (admin forces
// a password rotation on another user).
export const changePasswordAdminApiSchema = z.object({
  target_user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  password: z
    .string()
    .min(API_MIN_PASSWORD_LEN, `La contraseña debe tener al menos ${API_MIN_PASSWORD_LEN} caracteres`),
  must_change_password: z.boolean().optional(),
});

// Body accepted by POST /api/auth/cambiar-rol-usuario. Admin updates
// another user's role in the shared workspace.
export const changeRoleApiSchema = z.object({
  target_user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  role: z.enum(['admin', 'manager', 'member']),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type CreateUserApiInput = z.infer<typeof createUserApiSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type ChangePasswordAdminApiInput = z.infer<typeof changePasswordAdminApiSchema>;
export type ChangeRoleApiInput = z.infer<typeof changeRoleApiSchema>;
