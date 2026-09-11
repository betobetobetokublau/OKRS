import { NextResponse } from 'next/server';

/**
 * Connectivity probe for the PWA banner. Deliberately unauthenticated and
 * side-effect free: it returns no data, only proves that the origin is
 * reachable. The service worker passes `/api/*` through untouched, so a 204
 * here can never come from a cache. `no-store` keeps intermediaries out too.
 */
export const dynamic = 'force-dynamic';

export function HEAD() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export function GET() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
