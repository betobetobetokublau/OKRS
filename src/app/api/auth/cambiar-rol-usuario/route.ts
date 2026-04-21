import { createAdminClient } from '@/lib/supabase/server';
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
 *   4. updates via the service-role client so RLS can stay locked down.
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

    // Target must be a member of this workspace (prevents cross-workspace
    // admin from mutating a stranger's row).
    const { data: targetUw } = await supabase
      .from('user_workspaces')
      .select('id, role')
      .eq('user_id', target_user_id)
      .eq('workspace_id', workspace_id)
      .single();
    if (!targetUw) {
      return NextResponse.json(
        { error: 'El usuario no pertenece a este workspace' },
        { status: 404 },
      );
    }

    // Last-admin guard: if the target is currently the only admin AND
    // we're demoting them, refuse — otherwise the workspace would be
    // orphaned (no one left to re-promote).
    if (targetUw.role === 'admin' && role !== 'admin') {
      const { count } = await supabase
        .from('user_workspaces')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace_id)
        .eq('role', 'admin');
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'No puedes quitar el último administrador del workspace.' },
          { status: 400 },
        );
      }
    }

    // Perform the update with the service-role client; RLS on
    // user_workspaces.UPDATE stays closed for the authenticated role.
    const adminClient = createAdminClient();
    const { error: updateError } = await adminClient
      .from('user_workspaces')
      .update({ role })
      .eq('id', targetUw.id);

    if (updateError) {
      console.error('[api/auth/cambiar-rol-usuario] update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/auth/cambiar-rol-usuario] failed:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
