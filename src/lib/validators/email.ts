import { z } from 'zod';

// Templates a caller may request via POST /api/email/enviar. Keep in sync
// with Postmark's configured aliases; the API route enforces this list as
// the single authoritative allow-list.
export const ALLOWED_EMAIL_TEMPLATES = [
  'monthly-review-reminder',
  'quarterly-session-invite',
  'welcome-new-user',
] as const;

export const sendEmailApiSchema = z.object({
  to: z.string().email('Email inválido'),
  template_alias: z.enum(ALLOWED_EMAIL_TEMPLATES),
  template_model: z.record(z.string(), z.unknown()).default({}),
  workspace_id: z.string().uuid(),
});

export type SendEmailApiInput = z.infer<typeof sendEmailApiSchema>;
