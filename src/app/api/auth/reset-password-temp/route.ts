import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * TEMPORARY unauthenticated password reset endpoint.
 * Accepts { email, password } and forcibly sets the user's password.
 * DELETE THIS ROUTE after regaining access.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña son requeridos.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: 'Error buscando usuario.' }, { status: 500 });
    }

    const user = users.find((u) => u.email === email);
    if (!user) {
      return NextResponse.json({ error: 'No se encontró un usuario con ese correo.' }, { status: 404 });
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      password,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await adminClient
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', user.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
