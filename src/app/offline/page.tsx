import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sin conexión · Kublau OKRs',
};

// Statically prerendered and precached by /public/sw.js. Middleware excludes
// /offline so it is reachable without a session. Deliberately a server
// component with a tiny inline script: when the SW serves this document as a
// fallback the JS chunks may be unavailable, so the button must work without
// React hydration.
export const dynamic = 'force-static';

const RETRY_SCRIPT =
  "document.getElementById('pwa-retry').addEventListener('click',function(){location.reload();});";

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.4rem',
        backgroundColor: '#f4f6f8',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          border: '1px solid #dfe3e8',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(33,43,54,0.08)',
          padding: '3.2rem 2.8rem',
          textAlign: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- precached PNG, no optimisation wanted offline */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          style={{ borderRadius: '16px', display: 'block', margin: '0 auto 2rem' }}
        />
        <h1 style={{ fontSize: '2.2rem', fontWeight: 600, margin: '0 0 0.8rem', color: '#212b36' }}>
          Sin conexión
        </h1>
        <p style={{ fontSize: '1.4rem', lineHeight: '2rem', color: '#637381', margin: '0 0 2.4rem' }}>
          Tus cambios se guardarán y se sincronizarán cuando vuelva la conexión.
        </p>
        <button
          id="pwa-retry"
          type="button"
          style={{
            display: 'inline-block',
            padding: '0.9rem 2rem',
            borderRadius: '6px',
            border: 'none',
            background: '#5c6ac4',
            color: '#ffffff',
            fontSize: '1.4rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
        <div style={{ marginTop: '1.6rem' }}>
          <a href="/" style={{ fontSize: '1.3rem', color: '#5c6ac4', textDecoration: 'none' }}>
            Volver al inicio
          </a>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: RETRY_SCRIPT }} />
    </main>
  );
}
