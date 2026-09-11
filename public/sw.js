/* eslint-disable */
/**
 * Kublau OKRs — service worker (hand-written, no build step, no deps).
 *
 * Caches
 *   kublau-shell-vN   precached app shell: /offline, manifest, icons (+ the
 *                     JS chunks the offline page references, best effort)
 *   kublau-static-vN  /_next/static, /icons, fonts, images  → cache-first
 *   kublau-pages-vN   HTML navigations + RSC payloads       → network-first / SWR
 *   kublau-data-vN    Supabase PostgREST GETs               → SWR, capped ~300
 *
 * Bump VERSION to invalidate every cache on the next activate.
 */

const VERSION = 'v6';
const SHELL_CACHE = `kublau-shell-${VERSION}`;
const STATIC_CACHE = `kublau-static-${VERSION}`;
const PAGES_CACHE = `kublau-pages-${VERSION}`;
const DATA_CACHE = `kublau-data-${VERSION}`;
const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE, PAGES_CACHE, DATA_CACHE];

const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-64.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
];

const NAVIGATION_TIMEOUT_MS = 12000;
const DATA_CACHE_MAX_ENTRIES = 300;

/* ------------------------------------------------------------------------ */
/* Routing decision                                                          */
/*                                                                           */
/* !!! KEEP IN SYNC with `src/lib/pwa/classify-request.ts` (unit-tested). !!! */
/* Same signature, same decision table. Edit both or neither.               */
/* ------------------------------------------------------------------------ */

const STATIC_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|css|js|map)$/i;

/**
 * @param {{url: string, mode: string, method: string, headers: {get(name: string): string|null}}} req
 * @param {string} selfOrigin
 * @returns {'navigate'|'static'|'rsc'|'supabase-data'|'passthrough'|'ignore'}
 */
function classifyRequest(req, selfOrigin) {
  if (req.method !== 'GET') return 'passthrough';

  let url;
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

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

function hasNoStore(response) {
  const cc = response.headers.get('Cache-Control') || '';
  return /no-store/i.test(cc);
}

/**
 * Whether a response may be written to a cache. `respectNoStore` is false for
 * HTML/RSC because Next.js marks every dynamically rendered page `no-store`
 * (dev and prod) — honouring it there would make the offline shell empty.
 * For static assets and Supabase data the header is honoured (this also keeps
 * `next dev`'s `no-store` HMR chunks out of the cache-first static cache).
 */
function isCacheable(response, { respectNoStore }) {
  if (!response || response.status !== 200) return false;
  if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  if (response.redirected) return false;
  if (respectNoStore && hasNoStore(response)) return false;
  return true;
}

/**
 * Release a response body we will neither return nor cache. An unread body
 * keeps its HTTP/1.1 connection busy; with the browser's 6-per-host limit a
 * handful of leaked bodies makes every later fetch (and the install step) hang.
 */
function discard(response) {
  try {
    if (response && response.body) response.body.cancel();
  } catch {
    /* already consumed / locked */
  }
}

/**
 * Navigation-safe fetch with timeout. NEVER call `fetch(request, init)` with a
 * `mode: 'navigate'` Request — Chrome throws synchronously ("Cannot construct a
 * Request with a Request whose mode is 'navigate' and a non-empty RequestInit"),
 * which we used to swallow as "offline" and answer with the fallback page.
 * We fetch by URL instead. `redirect: 'manual'` yields an opaqueredirect that a
 * navigation respondWith() may return, so /login redirects keep working.
 */
function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const init = {
    signal: controller.signal,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: request.headers.get('Accept') || 'text/html' },
  };
  if (request.mode === 'navigate') init.redirect = 'manual';
  return fetch(request.url, init).finally(() => clearTimeout(timer));
}

async function putSafely(cacheName, key, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
  } catch {
    /* quota / storage errors are non-fatal */
  }
}

let dataPutsSinceTrim = 0;
/** LRU-ish cap: Cache keys are in insertion order; we delete+put on every hit so the oldest untouched entry comes first. */
async function putDataAndTrim(key, response) {
  try {
    const cache = await caches.open(DATA_CACHE);
    await cache.delete(key);
    await cache.put(key, response);
    dataPutsSinceTrim += 1;
    if (dataPutsSinceTrim >= 20) {
      dataPutsSinceTrim = 0;
      const keys = await cache.keys();
      const excess = keys.length - DATA_CACHE_MAX_ENTRIES;
      for (let i = 0; i < excess; i++) {
        const k = keys[i];
        if (k) await cache.delete(k);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Precache the static /offline.html (plain HTML — no React, no chunks) plus manifest and icons. */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (res.status !== 200 || res.redirected) {
          discard(res);
          return;
        }
        if (url !== OFFLINE_URL) {
          await cache.put(url, res);
          return;
        }
        // Read the HTML once, cache it from the text, and reuse it to find chunks.
        const html = await res.text();
        await cache.put(
          url,
          new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
        );
        const chunkUrls = new Set();
        const re = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
        let m;
        while ((m = re.exec(html)) !== null) chunkUrls.add(m[1].replace(/&amp;/g, '&'));
        const staticCache = await caches.open(STATIC_CACHE);
        await Promise.all(
          Array.from(chunkUrls).map(async (chunk) => {
            try {
              const r = await fetch(chunk, { credentials: 'same-origin' });
              if (isCacheable(r, { respectNoStore: true })) await staticCache.put(chunk, r);
              else discard(r);
            } catch {
              /* best effort */
            }
          }),
        );
      } catch {
        /* best effort — install must not fail because one icon 404s */
      }
    }),
  );
}

/* ------------------------------------------------------------------------ */
/* Strategies                                                                */
/* ------------------------------------------------------------------------ */

async function handleNavigate(request) {
  // Offline for sure → don't even try the network; go straight to the cache so
  // the page appears instantly instead of after a timeout.
  if (self.navigator && self.navigator.onLine === false) {
    const cachedNow = await caches.match(stripHash(request.url), { ignoreVary: true });
    if (cachedNow) return cachedNow;
  }
  try {
    // Long timeout on purpose: serving a *stale* document while online is
    // worse than waiting — its chunk hashes may belong to a previous deploy
    // and 404, which shows up as a blank page / ChunkLoadError.
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (isCacheable(response, { respectNoStore: false })) {
      const ct = response.headers.get('Content-Type') || '';
      if (ct.includes('text/html')) {
        putSafely(PAGES_CACHE, stripHash(request.url), response.clone());
        // Make sure the chunks this document needs are cached too, even if the
        // browser already had them in HTTP cache (and therefore never hit us).
        response
          .clone()
          .text()
          .then((t) => cacheStaticAssets(extractStaticAssets(t)))
          .catch(() => undefined);
      }
    }
    return response;
  } catch {
    const cached = await caches.match(stripHash(request.url), { ignoreVary: true });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL, { ignoreVary: true });
    if (offline) return offline;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Sin conexión</title><p style="font-family:sans-serif;padding:2rem">Sin conexión. Reintenta cuando vuelva la red.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  // Icons are precached in the shell cache, chunks in the static cache: look
  // everywhere before going to the network (the /offline page's icon used to
  // 404 offline because of this).
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(response, { respectNoStore: true })) cache.put(request, response.clone());
    return response;
  } catch {
    // Offline and not cached: answer with a clean 503 instead of a rejected
    // promise (which surfaced as an uncaught SW error in DevTools).
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/** RSC payloads share the URL space with HTML; key them separately so they never collide in kublau-pages. */
function rscKey(url) {
  const u = new URL(url);
  u.hash = '';
  if (!u.searchParams.has('_rsc')) u.searchParams.set('_rsc', 'sw');
  return u.href;
}

function stripHash(url) {
  const u = new URL(url);
  u.hash = '';
  return u.href;
}

async function handleRsc(request) {
  const key = rscKey(request.url);
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(key, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response, { respectNoStore: false })) cache.put(key, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    // Keep the worker alive until revalidation lands (caller does waitUntil);
    // the page got the cached copy so the network body is only for the cache.
    return { response: cached, revalidate: network.then(discard) };
  }
  const fresh = await network;
  if (fresh) return { response: fresh };
  return { response: new Response('', { status: 503, statusText: 'Offline' }) };
}

async function handleSupabaseData(request) {
  const key = stripHash(request.url);
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(key, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response, { respectNoStore: true })) putDataAndTrim(key, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) return { response: cached, revalidate: network.then(discard) };
  const fresh = await network;
  if (fresh) return { response: fresh };
  // Offline with nothing cached: an empty JSON list keeps supabase-js from throwing on parse.
  return {
    response: new Response('[]', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

/**
 * Every `/_next/static/...` asset referenced by an HTML document or an RSC
 * payload (script/link tags in HTML; "static/chunks/…js" strings in flight
 * data). Warming a route without these produced ChunkLoadError offline.
 */
function extractStaticAssets(text) {
  const out = new Set();
  const attr = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let m;
  while ((m = attr.exec(text)) !== null) out.add(m[1].replace(/&amp;/g, '&'));
  const flight = /(?:\/_next\/)?static\/(?:chunks|css)\/[A-Za-z0-9_\-./%()\[\]]+?\.(?:js|css)/g;
  while ((m = flight.exec(text)) !== null) {
    const path = m[0].startsWith('/_next/') ? m[0] : `/_next/${m[0]}`;
    out.add(path.replace(/\\/g, ''));
  }
  return Array.from(out);
}

/** Cache-first fill of the static cache for a list of asset paths (skips what's already there). */
async function cacheStaticAssets(paths) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    paths.map(async (path) => {
      try {
        const url = new URL(path, self.location.origin).href;
        if (await cache.match(url, { ignoreVary: true })) return;
        const res = await fetch(url, { credentials: 'same-origin' });
        if (isCacheable(res, { respectNoStore: true })) await cache.put(url, res);
        else discard(res);
      } catch {
        /* best effort */
      }
    }),
  );
}

/** Fetch each route's HTML + RSC payload + the static assets they reference. Best effort, sequential to avoid a burst. */
async function warmRoutes(paths) {
  const cache = await caches.open(PAGES_CACHE);
  for (const path of paths) {
    const url = new URL(path, self.location.origin);
    if (url.origin !== self.location.origin) continue;
    try {
      const html = await fetch(url.href, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
        cache: 'no-cache',
      });
      const ct = html.headers.get('Content-Type') || '';
      if (!html.ok || html.redirected || !ct.includes('text/html')) {
        discard(html);
        continue; // redirected (e.g. to /login) → don't warm the rest for this path
      }
      const htmlText = await html.text();
      await cache.put(
        stripHash(url.href),
        new Response(htmlText, { status: 200, headers: { 'Content-Type': ct } }),
      );
      const assets = new Set(extractStaticAssets(htmlText));

      const rsc = await fetch(url.href, {
        credentials: 'same-origin',
        headers: { RSC: '1' },
        cache: 'no-cache',
      });
      if (rsc.ok && !rsc.redirected) {
        const rscText = await rsc.text();
        await cache.put(
          rscKey(url.href),
          new Response(rscText, {
            status: 200,
            headers: { 'Content-Type': rsc.headers.get('Content-Type') || 'text/x-component' },
          }),
        );
        extractStaticAssets(rscText).forEach((a) => assets.add(a));
      } else {
        discard(rsc);
      }
      await cacheStaticAssets(Array.from(assets));
    } catch {
      /* offline or transient — the next reconnect warms again */
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Lifecycle                                                                 */
/* ------------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page opts in by posting {type:'SKIP_WAITING'}.
  event.waitUntil(precacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('kublau-') && !ALL_CACHES.includes(n))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'WARM_ROUTES' && Array.isArray(data.urls)) {
    // The app asks us to pre-cache its main routes (HTML + RSC payload) so
    // they open offline even if the user never visited them in this session.
    event.waitUntil(warmRoutes(data.urls.filter((u) => typeof u === 'string').slice(0, 40)));
  } else if (data.type === 'CLEAR_USER_CACHES') {
    // Sent on logout: user-scoped HTML/RSC and Supabase rows must not survive
    // into the next session on a shared device.
    event.waitUntil(Promise.all([caches.delete(PAGES_CACHE), caches.delete(DATA_CACHE)]));
  }
});

self.addEventListener('fetch', (event) => {
  const kind = classifyRequest(event.request, self.location.origin);
  switch (kind) {
    case 'navigate':
      event.respondWith(handleNavigate(event.request));
      return;
    case 'static':
      event.respondWith(handleStatic(event.request));
      return;
    case 'rsc':
    case 'supabase-data': {
      const p = kind === 'rsc' ? handleRsc(event.request) : handleSupabaseData(event.request);
      event.respondWith(p.then((r) => r.response));
      event.waitUntil(p.then((r) => r.revalidate || undefined).catch(() => undefined));
      return;
    }
    default:
      // 'passthrough' / 'ignore': don't call respondWith → browser default.
      return;
  }
});
