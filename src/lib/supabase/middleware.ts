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

  // Check must_change_password
  if (pathname !== '/cambiar-password') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', user.id)
      .single();

    if (profile?.must_change_password) {
      return NextResponse.redirect(new URL('/cambiar-password', request.url));
    }
  }

  return response;
}
