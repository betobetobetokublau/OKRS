import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuth, requireWorkspaceRole } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';

const MIN_PASSWORD_LEN = 6;

/**
 * Admin-only endpoint: forcibly set another user's password and optionally
 * flag them for a password change at next login. Every call writes a row to
 * `password_reset_audits` for accountability (admin-on-admin resets can
 * otherwise enable silent impersonation).
 */
export async function POST(request: Request) {
  try {
    const authed = await requireAuth();
    if (authed instanceof NextResponse) return authed;
    const { user: currentUser, supabase } = authed;

    // Rate limit per caller: 10 resets / min.
    const rl = checkRateLimit(`reset-password:${currentUser.id}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes, intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const body = (await request.json()) as {
      target_user_id?: unknown;
      workspace_id?: unknown;
      password?: unknown;
      must_change_password?: unknown;
    };
    const target_user_id = typeof body.target_user_id === 'string' ? body.target_user_id : '';
    const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const must_change_password =
      typeof body.must_change_password === 'boolean' ? body.must_change_password : undefined;

    if (!target_user_id || !workspace_id || !password || password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `Datos inválidos (la contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres)` },
        { status: 400 },
      );
    }

    const roleResult = await requireWorkspaceRole(supabase, currentUser.id, workspace_id, 'admin');
    if (roleResult instanceof NextResponse) return roleResult;

    // Verify target belongs to the same workspace (prevents cross-workspace
    // admin from rotating a stranger's password).
    const { data: targetUw } = await supabase
      .from('user_workspaces')
      .select('user_id')
      .eq('user_id', target_user_id)
      .eq('workspace_id', workspace_id)
      .single();
    if (!targetUw) {
      return NextResponse.json(
        { error: 'El usuario no pertenece a este workspace' },
        { status: 404 },
      );
    }

    const adminClient = createAdminClient();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(target_user_id, {
      password,
    });
    if (updateError) {
      console.error('[api/auth/cambiar-password-usuario] updateUserById failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (typeof must_change_password === 'boolean') {
      await adminClient
        .from('profiles')
        .update({ must_change_password })
        .eq('id', target_user_id);
    }

    // Audit row — written with the service-role key, the only writer
    // allowed by the table's RLS config.
    await adminClient.from('password_reset_audits').insert({
      actor_user_id: currentUser.id,
      target_user_id,
      workspace_id,
      must_change_password: must_change_password ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/auth/cambiar-password-usuario] failed:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
