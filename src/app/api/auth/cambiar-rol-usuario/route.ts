import { NextResponse } from 'next/server';
import { requireAuth, requireWorkspaceRole } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/parse-body';
import { changeRoleApiSchema } from '@/lib/validators/user';

/**
 * Admin-only endpoint: change another workspace member's role.
 *
 * Why a server route (not a direct Supabase client update): the
 * `user_workspaces` table's RLS allows members to READ the full roster
 * (see 2026-04-16-workspace-visibility.sql) but doesn't grant any
 * UPDATE path. That's intentional — admins changing roles is sensitive
 * enough that we want it mediated by a server handler that:
 *   1. re-verifies the caller is a workspace admin,
 *   2. prevents cross-workspace escalation,
 *   3. blocks the last-admin demotion (would lock the workspace out),
 *   4. delegates the read-check-write to a SECURITY DEFINER RPC so the
 *      operation is atomic (no TOCTOU between the admin-count check
 *      and the role update).
 *
 * Atomicity: the previous count-then-update pattern was a textbook
 * TOCTOU — two concurrent demotions could both observe `count > 1`
 * before either committed. The RPC `change_workspace_role` (see
 * sql/2026-05-21-demote-if-safe.sql) takes a `FOR UPDATE` row lock
 * on the target user_workspace row and re-counts admins in the same
 * transaction, returning a structured `{ ok, error }` envelope.
 */
export async function POST(request: Request) {
  try {
    const authed = await requireAuth();
    if (authed instanceof NextResponse) return authed;
    const { user: currentUser, supabase } = authed;

    // Rate limit per caller: 30 role changes / min is plenty for any
    // legitimate admin workflow and a tight cap against abuse.
    const rl = checkRateLimit(`change-role:${currentUser.id}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes, intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const parsed = await parseJsonBody(request, changeRoleApiSchema);
    if (parsed instanceof NextResponse) return parsed;
    const { target_user_id, workspace_id, role } = parsed;

    // Must be an admin in THIS workspace.
    const roleResult = await requireWorkspaceRole(supabase, currentUser.id, workspace_id, 'admin');
    if (roleResult instanceof NextResponse) return roleResult;

    // Atomic: row-lock target, re-count admins, refuse last-admin
    // demotion, then update — all in one SECURITY DEFINER function.
    // Returns { ok: true } or { ok: false, error: '...' }.
    const { data: rpcData, error: rpcError } = await supabase.rpc('change_workspace_role', {
      p_target_user_id: target_user_id,
      p_workspace_id: workspace_id,
      p_new_role: role,
    });

    if (rpcError) {
      console.error('[api/auth/cambiar-rol-usuario] rpc failed:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const result = rpcData as { ok: boolean; error?: string } | null;
    if (!result || !result.ok) {
      const code = result?.error;
      if (code === 'not_in_workspace') {
        return NextResponse.json(
          { error: 'El usuario no pertenece a este workspace' },
          { status: 404 },
        );
      }
      if (code === 'last_admin') {
        return NextResponse.json(
          { error: 'No puedes quitar el último administrador del workspace.' },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: 'No se pudo cambiar el rol' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/auth/cambiar-rol-usuario] failed:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
