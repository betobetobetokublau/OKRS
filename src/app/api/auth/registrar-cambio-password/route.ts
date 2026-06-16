import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';

/**
 * Records a `password_reset_audits` row for a user-initiated password change.
 * The admin-initiated counterpart (`/api/auth/cambiar-password-usuario`)
 * already writes its own audit; this route closes the gap for self-changes
 * triggered from `/cambiar-password`.
 *
 * The audit table requires workspace_id (NOT NULL), so we attribute the
 * event to the caller's first workspace. For multi-workspace users this is
 * arbitrary but consistent.
 */
export async function POST() {
  try {
    const authed = await requireAuth({ allowMustChangePassword: true });
    if (authed instanceof NextResponse) return authed;
    const { user: currentUser } = authed;

    const rl = checkRateLimit(`audit-self-password:${currentUser.id}`, 5, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes, intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const adminClient = createAdminClient();
    const { data: uw } = await adminClient
      .from('user_workspaces')
      .select('workspace_id')
      .eq('user_id', currentUser.id)
      .limit(1)
      .maybeSingle();

    if (!uw?.workspace_id) {
      return NextResponse.json({ ok: true, skipped: 'no-workspace' });
    }

    await adminClient.from('password_reset_audits').insert({
      actor_user_id: currentUser.id,
      target_user_id: currentUser.id,
      workspace_id: uw.workspace_id,
      must_change_password: false,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/auth/registrar-cambio-password] failed:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
