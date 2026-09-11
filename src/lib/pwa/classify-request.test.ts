import { describe, expect, it } from 'vitest';
import { classifyRequest } from './classify-request';

const ORIGIN = 'https://okr.kublau.com';

function req(
  url: string,
  opts: { mode?: string; method?: string; headers?: Record<string, string> } = {},
) {
  const h = new Map(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    url,
    mode: opts.mode ?? 'cors',
    method: opts.method ?? 'GET',
    headers: { get: (name: string) => h.get(name.toLowerCase()) ?? null },
  };
}

describe('classifyRequest', () => {
  it('routes same-origin navigations', () => {
    expect(classifyRequest(req(`${ORIGIN}/acme/tableros/abc`, { mode: 'navigate' }), ORIGIN)).toBe('navigate');
    expect(classifyRequest(req(`${ORIGIN}/offline`, { mode: 'navigate' }), ORIGIN)).toBe('navigate');
    expect(classifyRequest(req(`${ORIGIN}/`, { mode: 'navigate' }), ORIGIN)).toBe('navigate');
  });

  it('never treats API routes or the worker script as documents', () => {
    expect(classifyRequest(req(`${ORIGIN}/api/checkin`, { mode: 'navigate' }), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${ORIGIN}/api/checkin`), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${ORIGIN}/sw.js`), ORIGIN)).toBe('passthrough');
  });

  it('classifies Next static assets, icons, fonts, manifest and images as static', () => {
    expect(classifyRequest(req(`${ORIGIN}/_next/static/chunks/main-app.js`), ORIGIN)).toBe('static');
    expect(classifyRequest(req(`${ORIGIN}/_next/static/css/app.css`), ORIGIN)).toBe('static');
    expect(classifyRequest(req(`${ORIGIN}/icons/icon-192.png`), ORIGIN)).toBe('static');
    expect(classifyRequest(req(`${ORIGIN}/fonts/inter.woff2`), ORIGIN)).toBe('static');
    expect(classifyRequest(req(`${ORIGIN}/manifest.webmanifest`), ORIGIN)).toBe('static');
    expect(classifyRequest(req(`${ORIGIN}/favicon.ico`), ORIGIN)).toBe('static');
    expect(classifyRequest(req(`${ORIGIN}/hero.webp`), ORIGIN)).toBe('static');
  });

  it('detects RSC payload requests by header or query', () => {
    expect(classifyRequest(req(`${ORIGIN}/acme/objetivos`, { headers: { RSC: '1' } }), ORIGIN)).toBe('rsc');
    expect(classifyRequest(req(`${ORIGIN}/acme/objetivos?_rsc=1abc`), ORIGIN)).toBe('rsc');
    // Plain same-origin fetch without RSC markers stays on the network.
    expect(classifyRequest(req(`${ORIGIN}/acme/objetivos`), ORIGIN)).toBe('passthrough');
  });

  it('caches only Supabase REST GETs', () => {
    const sb = 'https://abc.supabase.co';
    expect(classifyRequest(req(`${sb}/rest/v1/tasks?select=*`), ORIGIN)).toBe('supabase-data');
    expect(classifyRequest(req(`https://abc.supabase.in/rest/v1/tasks`), ORIGIN)).toBe('supabase-data');
    expect(classifyRequest(req(`${sb}/rest/v1/tasks`, { method: 'POST' }), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${sb}/rest/v1/tasks`, { method: 'PATCH' }), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${sb}/rest/v1/rpc/checkin`, { method: 'POST' }), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${sb}/auth/v1/token?grant_type=refresh_token`), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${sb}/auth/v1/user`), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${sb}/realtime/v1/websocket`), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${sb}/storage/v1/object/avatars/x.png`), ORIGIN)).toBe('passthrough');
  });

  it('passes through every non-GET, including same-origin navigations', () => {
    expect(classifyRequest(req(`${ORIGIN}/login`, { mode: 'navigate', method: 'POST' }), ORIGIN)).toBe('passthrough');
    expect(classifyRequest(req(`${ORIGIN}/_next/static/x.js`, { method: 'HEAD' }), ORIGIN)).toBe('passthrough');
  });

  it('ignores foreign origins and non-http schemes', () => {
    expect(classifyRequest(req('https://api.postmarkapp.com/email'), ORIGIN)).toBe('ignore');
    expect(classifyRequest(req('https://evil.example/_next/static/x.js'), ORIGIN)).toBe('ignore');
    expect(classifyRequest(req('https://notsupabase.co/rest/v1/x'), ORIGIN)).toBe('ignore');
    expect(classifyRequest(req('chrome-extension://abc/script.js'), ORIGIN)).toBe('ignore');
    expect(classifyRequest(req('not a url'), ORIGIN)).toBe('ignore');
  });
});
