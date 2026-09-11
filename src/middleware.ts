import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // PWA assets and the offline fallback must be reachable without a
    // session: the service worker, manifest, icons and /offline.
    '/((?!_next/static|_next/image|favicon.ico|api/|sw\\.js|manifest\\.webmanifest|icons/|offline).*)',
  ],
};
