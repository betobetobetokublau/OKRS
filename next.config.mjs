/** @type {import('next').NextConfig} */

// Content Security Policy.
//
// Trade-off notes:
// - `script-src 'unsafe-inline'` is required by Next.js runtime (inline
//   bootstrap scripts injected by the framework). The cleaner alternative
//   is per-request nonces, which is a substantially bigger lift (custom
//   middleware + propagating nonces through every <Script>/inline tag).
//   Document this here so future-us doesn't forget the deliberate choice.
// - `style-src 'unsafe-inline'` matches the project's inline-style React
//   convention (no Tailwind class-based styling).
// - connect-src includes Supabase REST/Realtime (wss) and Postmark.
// - frame-ancestors 'none' + X-Frame-Options: DENY = belt and suspenders
//   against clickjacking.
const csp = [
  "default-src 'self'",
  // Next.js dev mode evaluates source-mapped chunks with eval(); without
  // 'unsafe-eval' React never hydrates locally (forms submit as plain GETs).
  // Production bundles don't eval, so the stricter policy stays in prod.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.postmarkapp.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig = {
  async headers() {
    return [
      {
        // All routes except Next.js static assets and the favicon.
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
