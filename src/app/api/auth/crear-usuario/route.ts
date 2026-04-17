import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuth, requireWorkspaceRole } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createUserApiSchema } from '@/lib/validators/user';

export async function POST(request: Request) {
  try {
    const authed = await requireAuth();
    if (authed instanceof NextResponse) return authed;
    const { user: currentUser, supabase } = authed;

    // Rate limit: 10 creates / min per caller. Enough for a real admin
    // onboarding a batch, but not enough for abuse.
    const rl = checkRateLimit(`create-user:${currentUser.id}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes, intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const parsed = await parseJsonBody(request, createUserApiSchema);
    if (parsed instanceof NextResponse) return parsed;
    const {
      email: rawEmail,
      full_name: rawFullName,
      password,
      role,
      workspace_id,
      department_ids,
      must_change_password,
    } = parsed;
    const email = rawEmail.trim();
    const full_name = rawFullName.trim();

    // Caller must be admin in target workspace.
    const roleResult = await requireWorkspaceRole(supabase, currentUser.id, workspace_id, 'admin');
    if (roleResult instanceof NextResponse) return roleResult;

    const adminClient = createAdminClient();
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError || !newUser.user) {
      return NextResponse.json(
        { error: createError?.message || 'Error al crear usuario' },
        { status: 400 },
      );
    }

    // Profile + membership + departments. Any of these failing leaves the
    // Supabase auth user orphaned, which is annoying but not a security
    // issue; an admin can retry. A transactional wrapper would need RPC.
    await adminClient.from('profiles').insert({
      id: newUser.user.id,
      email,
      full_name,
      must_change_password,
    });
    await adminClient.from('user_workspaces').insert({
      user_id: newUser.user.id,
      workspace_id,
      role,
    });
    if (department_ids && department_ids.length > 0) {
      await adminClient.from('user_departments').insert(
        department_ids.map((did) => ({ user_id: newUser.user!.id, department_id: did })),
      );
    }

    return NextResponse.json({ user_id: newUser.user.id });
  } catch (err) {
    console.error('[api/auth/crear-usuario] failed:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
