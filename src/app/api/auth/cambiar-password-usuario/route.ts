import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Admin-only endpoint: forcibly set another user's password and optionally
 * flag them for a password change at next login. Used by the Equipo view.
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { target_user_id, workspace_id, password, must_change_password } =
      (await request.json()) as {
        target_user_id: string;
        workspace_id: string;
        password: string;
        must_change_password?: boolean;
      };

    if (!target_user_id || !workspace_id || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Datos inválidos (la contraseña debe tener al menos 6 caracteres)' },
        { status: 400 },
      );
    }

    // Verify caller is admin in the workspace
    const { data: callerUw } = await supabase
      .from('user_workspaces')
      .select('role')
      .eq('user_id', currentUser.id)
      .eq('workspace_id', workspace_id)
      .single();
    if (!callerUw || callerUw.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo administradores pueden cambiar contraseñas' },
        { status: 403 },
      );
    }

    // Verify target belongs to the same workspace (prevents cross-workspace attack)
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
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Flip the must_change_password flag if specified.
    if (typeof must_change_password === 'boolean') {
      await adminClient
        .from('profiles')
        .update({ must_change_password })
        .eq('id', target_user_id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
