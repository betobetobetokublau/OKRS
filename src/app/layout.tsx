import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaProvider } from '@/components/pwa/pwa-provider';

export const metadata: Metadata = {
  title: 'Kublau OKRs',
  description: 'Sistema de gestión de objetivos, KPIs y tareas',
  applicationName: 'Kublau OKRs',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  other: { 'mobile-web-app-capable': 'yes' },
  appleWebApp: {
    capable: true,
    title: 'Kublau OKRs',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#026fff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
