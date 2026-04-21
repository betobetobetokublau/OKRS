import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/require-auth';
import { checkRateLimit } from '@/lib/api/rate-limit';

/**
 * Marks the authed user's onboarding carousel as completed by stamping
 * `profiles.onboarded_at = now()`. Server-mediated because `profiles`
 * has no user-facing UPDATE policy in the current RLS config — we want
 * writes to go through a controlled path rather than widening RLS for
 * a single column.
 *
 * Idempotent: calling it twice just re-stamps the timestamp.
 */
export async function POST() {
  try {
    const authed = await requireAuth();
    if (authed instanceof NextResponse) return authed;
    const { user: currentUser } = authed;

    // Defensive cap; the carousel only fires once per user in practice.
    const rl = checkRateLimit(`complete-onboarding:${currentUser.id}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes, intenta más tarde.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', currentUser.id);

    if (error) {
      console.error('[api/onboarding/completar] update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/onboarding/completar] failed:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
