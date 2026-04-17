import { NextResponse } from 'next/server';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface AuthedContext {
  user: User;
  supabase: SupabaseClient;
}

export interface RequireAuthOptions {
  /**
   * If true, allows users with `must_change_password = true` through.
   * Only set this on the endpoint the user uses to rotate their own
   * password — every other endpoint should block until the password is
   * rotated.
   */
  allowMustChangePassword?: boolean;
}

/**
 * Single entry point for authenticating API routes. Returns either an
 * `{ user, supabase }` tuple on success, or a `NextResponse` (which the
 * caller must return verbatim) on failure.
 *
 * Centralising this means middleware.ts' `must_change_password` guard
 * (which only runs on page routes) is also applied to API routes,
 * closing the gap where a freshly-provisioned user could skip the
 * rotation flow by hitting `/api/*` directly.
 */
export async function requireAuth(
  options: RequireAuthOptions = {},
): Promise<AuthedContext | NextResponse> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!options.allowMustChangePassword) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single();
    if (profile?.must_change_password) {
      return NextResponse.json(
        { error: 'Debes cambiar tu contraseña antes de continuar.' },
        { status: 428 }, // 428 Precondition Required
      );
    }
  }

  return { user, supabase };
}

/**
 * Verifies `user` is a member of `workspace_id` and optionally that they
 * hold at least `minRole`. Returns the role on success or a NextResponse
 * on failure.
 */
export async function requireWorkspaceRole(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
  minRole: 'member' | 'manager' | 'admin' = 'member',
): Promise<string | NextResponse> {
  if (!workspaceId || typeof workspaceId !== 'string') {
    return NextResponse.json(
      { error: 'workspace_id requerido' },
      { status: 400 },
    );
  }
  const { data: uw } = await supabase
    .from('user_workspaces')
    .select('role')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .single();
  if (!uw) {
    return NextResponse.json(
      { error: 'No perteneces a este workspace' },
      { status: 403 },
    );
  }
  const rank: Record<string, number> = { member: 1, manager: 2, admin: 3 };
  if ((rank[uw.role] ?? 0) < rank[minRole]) {
    return NextResponse.json(
      { error: 'Permisos insuficientes' },
      { status: 403 },
    );
  }
  return uw.role as string;
}
