import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuth, requireWorkspaceRole } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';

// RFC-ish email check. Supabase validates too, but rejecting early gives
// a cleaner 400 than letting the admin API bubble.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(['member', 'manager', 'admin']);
const MIN_PASSWORD_LEN = 6;

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

    const body = (await request.json()) as {
      email?: unknown;
      full_name?: unknown;
      password?: unknown;
      role?: unknown;
      workspace_id?: unknown;
      department_ids?: unknown;
      must_change_password?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : 'member';
    const workspace_id = typeof body.workspace_id === 'string' ? body.workspace_id : '';
    const department_ids = Array.isArray(body.department_ids)
      ? body.department_ids.filter((x): x is string => typeof x === 'string')
      : [];
    const must_change_password =
      typeof body.must_change_password === 'boolean' ? body.must_change_password : true;

    // --- Input validation ---
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }
    if (!full_name) {
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
    }
    if (!password || password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres` },
        { status: 400 },
      );
    }
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

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
    if (department_ids.length > 0) {
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
