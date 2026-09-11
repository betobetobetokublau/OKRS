import type { MetadataRoute } from 'next';

/**
 * Web app manifest (served at /manifest.webmanifest). Makes the platform
 * installable on desktop and mobile. Icons live in /public/icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kublau OKRs',
    short_name: 'Kublau OKRs',
    description: 'Objetivos, KPIs, tableros y check-ins de Kublau',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4f6f8',
    theme_color: '#026fff',
    lang: 'es',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
