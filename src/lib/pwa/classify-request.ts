/**
 * Pure routing decision for the service worker.
 *
 * !!! KEEP IN SYNC with `classifyRequest` at the top of `public/sw.js`. !!!
 * The SW is a plain script with no build step, so the function is duplicated
 * verbatim there; this TypeScript copy exists so the decision table can be
 * unit-tested (`classify-request.test.ts`). Any change here must be mirrored.
 */

export type RequestKind =
  /** Same-origin document navigation: network-first, fallback cache, then /offline. */
  | 'navigate'
  /** Next static chunks, icons, fonts, images: cache-first. */
  | 'static'
  /** React Server Components payload (RSC: 1 header or ?_rsc=): stale-while-revalidate. */
  | 'rsc'
  /** Supabase PostgREST GET: stale-while-revalidate in the data cache. */
  | 'supabase-data'
  /** Same-origin or Supabase request we deliberately leave to the network. */
  | 'passthrough'
  /** Foreign origin: the SW does not touch it at all. */
  | 'ignore';

export interface ClassifiableRequest {
  url: string;
  mode: string;
  method: string;
  headers: { get(name: string): string | null };
}

const STATIC_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|css|js|map)$/i;

export function classifyRequest(req: ClassifiableRequest, selfOrigin: string): RequestKind {
  if (req.method !== 'GET') return 'passthrough';

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return 'ignore';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'ignore';

  if (url.origin === selfOrigin) {
    if (req.mode === 'navigate') {
      // API routes and the worker itself are never documents we want to shell.
      if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return 'passthrough';
      return 'navigate';
    }
    if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return 'passthrough';
    if (
      url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.startsWith('/fonts/') ||
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/favicon.ico' ||
      STATIC_EXT.test(url.pathname)
    ) {
      return 'static';
    }
    if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return 'rsc';
    return 'passthrough';
  }

  const host = url.hostname;
  if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) {
    if (url.pathname.startsWith('/rest/v1/')) return 'supabase-data';
    // /auth/v1, /realtime/v1, /storage/v1, /functions/v1 … never cached.
    return 'passthrough';
  }

  return 'ignore';
}
