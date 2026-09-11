'use client';

import { useEffect, useState } from 'react';
import { useOfflineStore } from '@/stores/offline-store';
import { AnimatedModal } from '@/components/common/animated-modal';

export const PWA_BANNER_HEIGHT = 28;

type BannerKind = 'offline' | 'syncing' | 'failures' | null;

/**
 * Slim status bar fixed at the very top of the viewport, above the 56px
 * topbar. While visible it sets `--pwa-banner-h` on <html>; globals.css pads
 * <body> by that amount and the sticky topbar / fixed sidebar offset their
 * `top` by it, so the whole app shifts down instead of being covered.
 */
export function OfflineBanner() {
  const online = useOfflineStore((s) => s.online);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const syncing = useOfflineStore((s) => s.syncing);
  const failures = useOfflineStore((s) => s.failures);
  const clearFailures = useOfflineStore((s) => s.clearFailures);
  const updateAvailable = useOfflineStore((s) => s.updateAvailable);
  const [showFailures, setShowFailures] = useState(false);

  let kind: BannerKind = null;
  if (!online) kind = 'offline';
  else if (syncing) kind = 'syncing';
  else if (failures.length > 0) kind = 'failures';

  useEffect(() => {
    const root = document.documentElement;
    if (kind) root.style.setProperty('--pwa-banner-h', `${PWA_BANNER_HEIGHT}px`);
    else root.style.removeProperty('--pwa-banner-h');
    return () => {
      root.style.removeProperty('--pwa-banner-h');
    };
  }, [kind]);

  useEffect(() => {
    if (failures.length === 0) setShowFailures(false);
  }, [failures.length]);

  const bg = kind === 'offline' ? '#212b36' : kind === 'syncing' ? '#5c6ac4' : '#de3618';

  let text = '';
  if (kind === 'offline') {
    text =
      'Sin conexión — los cambios se guardan en este dispositivo' +
      (pendingCount > 0 ? ` · ${pendingCount} ${pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'}` : '');
  } else if (kind === 'syncing') {
    text = `Sincronizando ${pendingCount} ${pendingCount === 1 ? 'cambio' : 'cambios'}…`;
  } else if (kind === 'failures') {
    text = `${failures.length} ${failures.length === 1 ? 'cambio no se pudo sincronizar' : 'cambios no se pudieron sincronizar'}`;
  }

  return (
    <>
      {kind && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 400,
            height: `${PWA_BANNER_HEIGHT}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.2rem',
            padding: '0 1.6rem',
            backgroundColor: bg,
            color: '#ffffff',
            fontSize: '1.2rem',
            fontWeight: 500,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          {kind === 'failures' && (
            <button
              type="button"
              onClick={() => setShowFailures(true)}
              style={{
                border: '1px solid rgba(255,255,255,0.6)',
                background: 'transparent',
                color: '#ffffff',
                borderRadius: '4px',
                padding: '0.2rem 0.8rem',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
            >
              Ver
            </button>
          )}
        </div>
      )}

      <AnimatedModal open={showFailures} onClose={() => setShowFailures(false)} width={480} zIndex={450}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 600, margin: '0 0 0.6rem', color: '#212b36' }}>
          Cambios no sincronizados
        </h2>
        <p style={{ fontSize: '1.3rem', color: '#637381', margin: '0 0 1.6rem', lineHeight: '1.9rem' }}>
          Estos cambios se guardaron en este dispositivo pero el servidor los rechazó. Revísalos y vuelve a
          aplicarlos manualmente.
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '40vh', overflowY: 'auto' }}>
          {failures.map((f) => (
            <li
              key={f.id}
              style={{
                padding: '1rem 1.2rem',
                border: '1px solid #dfe3e8',
                borderRadius: '8px',
                marginBottom: '0.8rem',
                background: '#fafbfb',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>{f.label}</span>
                <span style={{ fontSize: '1.1rem', color: '#637381', whiteSpace: 'nowrap' }}>{formatTime(f.at)}</span>
              </div>
              <div style={{ fontSize: '1.2rem', color: '#de3618', wordBreak: 'break-word' }}>{f.error}</div>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1.6rem' }}>
          <button
            type="button"
            onClick={() => setShowFailures(false)}
            style={{
              padding: '0.8rem 1.4rem',
              borderRadius: '6px',
              border: '1px solid #c4cdd5',
              background: '#ffffff',
              color: '#212b36',
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              clearFailures();
              setShowFailures(false);
            }}
            style={{
              padding: '0.8rem 1.4rem',
              borderRadius: '6px',
              border: 'none',
              background: '#de3618',
              color: '#ffffff',
              fontSize: '1.3rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Descartar
          </button>
        </div>
      </AnimatedModal>

      {updateAvailable && <UpdatePill />}
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Bottom-right pill: tells the waiting SW to take over, then reloads once it controls the page. */
function UpdatePill() {
  const [busy, setBusy] = useState(false);

  async function handleUpdate() {
    if (busy || !('serviceWorker' in navigator)) return;
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const waiting = reg?.waiting;
    if (!waiting) {
      // Nothing waiting any more (another tab already activated it) — just reload.
      window.location.reload();
      return;
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  return (
    <button
      type="button"
      onClick={handleUpdate}
      disabled={busy}
      style={{
        position: 'fixed',
        right: '1.6rem',
        bottom: '1.6rem',
        zIndex: 400,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.8rem 1.4rem',
        borderRadius: '999px',
        border: 'none',
        background: '#5c6ac4',
        color: '#ffffff',
        fontSize: '1.25rem',
        fontWeight: 500,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      Nueva versión disponible · <strong style={{ fontWeight: 700 }}>{busy ? 'Actualizando…' : 'Actualizar'}</strong>
    </button>
  );
}
