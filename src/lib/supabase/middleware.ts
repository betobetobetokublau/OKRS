import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          const cookieOptions = { name, value, ...options } as {
            name: string;
            value: string;
            [key: string]: unknown;
          };
          request.cookies.set(cookieOptions as never);
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set(cookieOptions as never);
        },
        remove(name: string, options: Record<string, unknown>) {
          const cookieOptions = { name, value: '', ...options } as {
            name: string;
            value: string;
            [key: string]: unknown;
          };
          request.cookies.set(cookieOptions as never);
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set(cookieOptions as never);
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Public routes
  if (pathname === '/login') {
    if (user) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return response;
  }

  // No session — redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Check must_change_password.
  //
  // Previously this ran a `select must_change_password` DB query on EVERY
  // non-/cambiar-password navigation — even for users who had rotated
  // their password long ago. We now cache the "OK" result in a short-
  // lived cookie (`kublau-pwd-ok`, 1h). If the cookie is present we trust
  // it and skip the DB roundtrip. Tradeoff: when an admin force-resets a
  // user via `cambiar-password-usuario` (or the user self-rotates), the
  // cookie persists up to ~1h on already-active sessions — acceptable lag
  // for re-prompting. The HTTP-only / SameSite=Lax flags prevent the
  // cookie from being read by client JS or sent on cross-site requests.
  if (pathname !== '/cambiar-password') {
    const cachedOk = request.cookies.get('kublau-pwd-ok')?.value === '1';

    if (!cachedOk) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', user.id)
        .single();

      if (profile?.must_change_password) {
        return NextResponse.redirect(new URL('/cambiar-password', request.url));
      }

      // Cache the negative-check for an hour. We set on the response
      // (so the browser receives it) — the @supabase/ssr cookie pattern
      // already keeps `request.cookies` and `response.cookies` in sync
      // for auth cookies; this is a separate, non-auth cookie that only
      // lives on the response.
      response.cookies.set({
        name: 'kublau-pwd-ok',
        value: '1',
        maxAge: 60 * 60, // 1 hour
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
  }

  return response;
}
