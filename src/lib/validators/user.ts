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
//
// `target_user_id` / `workspace_id` are validated as non-empty strings
// rather than strict UUIDs because zod 4's `.uuid()` is very strict and
// any non-standard value (empty string, stray whitespace, slug-shaped
// data drifted in from the store) triggers a cryptic 400 that's a pain
// to diagnose client-side. The real security boundary is the downstream
// `requireWorkspaceRole` + `user_workspaces` lookup: those fail safely
// with 403/404 for any id that doesn't resolve to a real row, so the
// format check wasn't buying us anything.
export const changeRoleApiSchema = z.object({
  target_user_id: z.string().min(1, 'target_user_id requerido'),
  workspace_id: z.string().min(1, 'workspace_id requerido'),
  role: z.enum(['admin', 'manager', 'member']),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type CreateUserApiInput = z.infer<typeof createUserApiSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type ChangePasswordAdminApiInput = z.infer<typeof changePasswordAdminApiSchema>;
export type ChangeRoleApiInput = z.infer<typeof changeRoleApiSchema>;
