'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Workspace route error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f4f6f8',
        padding: '2.4rem',
      }}
    >
      <div
        className="Polaris-Card"
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '3rem 2.4rem',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 600,
            color: '#212b36',
            marginBottom: '0.8rem',
          }}
        >
          Algo salió mal
        </h1>
        <p
          style={{
            fontSize: '1.4rem',
            color: '#637381',
            marginBottom: '2rem',
            lineHeight: 1.5,
          }}
        >
          No pudimos cargar esta sección. Intenta de nuevo o vuelve al dashboard.
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
            alignItems: 'stretch',
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '1rem 1.6rem',
              fontSize: '1.4rem',
              fontWeight: 500,
              color: '#ffffff',
              backgroundColor: '#5c6ac4',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            style={{
              padding: '1rem 1.6rem',
              fontSize: '1.4rem',
              fontWeight: 500,
              color: '#5c6ac4',
              backgroundColor: 'transparent',
              border: '1px solid #5c6ac4',
              borderRadius: '4px',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
