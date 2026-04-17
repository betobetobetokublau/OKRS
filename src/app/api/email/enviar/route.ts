import { createAdminClient } from '@/lib/supabase/server';
import { getPostmarkClient } from '@/lib/postmark/client';
import { NextResponse } from 'next/server';
import { requireAuth, requireWorkspaceRole } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';

// Templates a caller may request. Anything outside this list is rejected,
// which prevents the endpoint from being used as a generic Postmark relay
// for arbitrary templates on the verified sender domain.
const ALLOWED_TEMPLATES = new Set<string>([
  'monthly-review-reminder',
  'quarterly-session-invite',
  'welcome-new-user',
]);

export async function POST(request: Request) {
  try {
    const authed = await requireAuth();
    if (authed instanceof NextResponse) return authed;
    const { user, supabase } = authed;

    // Rate limit: 20 req / min per user.
    const rl = checkRateLimit(`email:${user.id}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes, intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const body = (await request.json()) as {
      to?: unknown;
      template_alias?: unknown;
      template_model?: unknown;
      workspace_id?: unknown;
    };
    const to = typeof body.to === 'string' ? body.to : '';
    const template_alias = typeof body.template_alias === 'string' ? body.template_alias : '';
    const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : '';
    const template_model =
      body.template_model && typeof body.template_model === 'object'
        ? (body.template_model as Record<string, unknown>)
        : {};

    if (!to || !template_alias || !workspace_id) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }
    if (!ALLOWED_TEMPLATES.has(template_alias)) {
      return NextResponse.json(
        { error: 'Plantilla no permitida' },
        { status: 400 },
      );
    }

    // Caller must be at least a manager in the target workspace.
    const roleResult = await requireWorkspaceRole(supabase, user.id, workspace_id, 'manager');
    if (roleResult instanceof NextResponse) return roleResult;

    // Recipient must actually belong to that workspace. We use the admin
    // client for this lookup so the check doesn't depend on the target
    // user's profile RLS being readable by the caller.
    const admin = createAdminClient();
    const { data: recipientProfile } = await admin
      .from('profiles')
      .select('id, email')
      .eq('email', to)
      .maybeSingle();
    if (!recipientProfile) {
      return NextResponse.json({ error: 'Destinatario no encontrado' }, { status: 404 });
    }
    const { data: recipientMembership } = await admin
      .from('user_workspaces')
      .select('user_id')
      .eq('user_id', recipientProfile.id)
      .eq('workspace_id', workspace_id)
      .maybeSingle();
    if (!recipientMembership) {
      return NextResponse.json(
        { error: 'El destinatario no pertenece a este workspace' },
        { status: 403 },
      );
    }

    const client = getPostmarkClient();
    const result = await client.sendEmailWithTemplate({
      From: process.env.POSTMARK_FROM_EMAIL!,
      To: to,
      TemplateAlias: template_alias,
      TemplateModel: template_model,
    });

    await admin.from('email_logs').insert({
      user_id: user.id,
      workspace_id,
      template_alias,
      postmark_message_id: result.MessageID,
      status: 'sent',
    });

    return NextResponse.json({ message_id: result.MessageID });
  } catch (err) {
    console.error('[api/email/enviar] failed:', err);
    return NextResponse.json({ error: 'Error al enviar email' }, { status: 500 });
  }
}
