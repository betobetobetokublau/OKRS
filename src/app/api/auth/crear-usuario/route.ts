import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      email,
      full_name,
      password,
      role,
      workspace_id,
      department_ids,
      must_change_password,
    } = body as {
      email: string;
      full_name: string;
      password: string;
      role?: string;
      workspace_id: string;
      department_ids?: string[];
      must_change_password?: boolean;
    };

    // Verify current user is admin in workspace
    const { data: uw } = await supabase
      .from('user_workspaces')
      .select('role')
      .eq('user_id', currentUser.id)
      .eq('workspace_id', workspace_id)
      .single();

    if (!uw || uw.role !== 'admin') {
      return NextResponse.json({ error: 'Solo administradores pueden crear usuarios' }, { status: 403 });
    }

    // Create user with admin client
    const adminClient = createAdminClient();
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message || 'Error al crear usuario' }, { status: 400 });
    }

    // Create profile — honor the caller's must_change_password flag; default true.
    const shouldForceChange = must_change_password !== false;
    await adminClient.from('profiles').insert({
      id: newUser.user.id,
      email,
      full_name,
      must_change_password: shouldForceChange,
    });

    // Add to workspace
    await adminClient.from('user_workspaces').insert({
      user_id: newUser.user.id,
      workspace_id,
      role: role || 'member',
    });

    // Add to departments
    if (department_ids && department_ids.length > 0) {
      await adminClient.from('user_departments').insert(
        department_ids.map((did: string) => ({
          user_id: newUser.user.id,
          department_id: did,
        }))
      );
    }

    return NextResponse.json({ user_id: newUser.user.id });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
