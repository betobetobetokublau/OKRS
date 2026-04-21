'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { WorkspaceRole } from '@/types';

/**
 * First-login onboarding carousel for members + managers. Three slides,
 * each with a title, short description (≤3 sentences), and a line-icon.
 * Overlay modal — can't be dismissed by clicking the backdrop; user has
 * to click through or explicitly skip.
 *
 * The mount decision lives in the dashboard layout (see `layout.tsx`):
 * it renders this only when `profile.onboarded_at === null` and
 * `role !== 'admin'`. Completion POSTs to `/api/onboarding/completar`
 * which stamps `profiles.onboarded_at = now()`.
 *
 * "Finish" routes the user to their natural landing page (member →
 * `/check-in`, manager → `/objetivos`) so onboarding ends on the
 * action the third slide just taught.
 */
interface OnboardingCarouselProps {
  role: WorkspaceRole;
  onDone: () => void;
}

interface Slide {
  title: string;
  description: string;
  icon: 'bullseye' | 'flag' | 'calendar-check';
}

const SLIDES: Slide[] = [
  {
    title: 'Bienvenido a Kublau',
    description:
      'Aquí tu equipo convierte objetivos en resultados medibles. Los KPIs marcan la dirección, los objetivos concretan cómo llegar, y las tareas son los pasos del día a día. Todo queda visible para todos en un solo lugar.',
    icon: 'bullseye',
  },
  {
    title: 'Los objetivos de tu empresa',
    description:
      'Cada objetivo tiene un responsable, un departamento y un plazo. En esta vista ves los que te tocan con su avance, estado y tareas vinculadas. Filtra por estado cuando necesites enfocarte o registrar un bloqueo.',
    icon: 'flag',
  },
  {
    title: 'Tu check-in mensual',
    description:
      'Una vez al mes actualizas el avance de tus objetivos y tareas en una sola pantalla. Al guardar, todo queda registrado en la línea de actividad del workspace. Te avisaremos por email cuando sea tu turno.',
    icon: 'calendar-check',
  },
];

export function OnboardingCarousel({ role, onDone }: OnboardingCarouselProps) {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = (params['workspace-slug'] as string) || '';
  const [index, setIndex] = useState(0);
  const [completing, setCompleting] = useState(false);

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  // Final destination depends on the role — members see only Check-in +
  // Objetivos in their nav so landing on the analytics dashboard would
  // feel broken.
  const finalLanding = useMemo(() => {
    if (!workspaceSlug) return null;
    return role === 'member'
      ? `/${workspaceSlug}/check-in`
      : `/${workspaceSlug}/objetivos`;
  }, [role, workspaceSlug]);

  const complete = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      // Fire-and-forget semantics are fine: the parent clears the gate
      // via `onDone` regardless so the user isn't blocked if the server
      // is flaky. A failed POST just means they'll see the carousel
      // again on the next refresh.
      await fetch('/api/onboarding/completar', { method: 'POST' });
    } catch (err) {
      console.error('[onboarding] completar failed:', err);
    } finally {
      onDone();
      if (finalLanding) router.push(finalLanding);
    }
  }, [completing, onDone, finalLanding, router]);

  function next() {
    if (isLast) {
      void complete();
    } else {
      setIndex((i) => i + 1);
    }
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }
  function skip() {
    void complete();
  }

  // Keyboard nav — arrows + Enter. Backdrop clicks are ignored on
  // purpose (dismissal requires a deliberate click on Saltar/Empezar).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, isLast]);

  return (
    <div
      className="anim-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 24, 48, 0.55)',
        zIndex: 400,
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Introducción a Kublau"
        className="anim-modal-card"
        style={{
          width: 'min(520px, 100%)',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 30px 80px -20px rgba(15,24,48,0.35)',
          padding: '3.2rem 3.2rem 2.4rem',
          textAlign: 'center',
        }}
      >
        {/* Icon badge */}
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 2rem',
            borderRadius: '20px',
            background: 'linear-gradient(180deg, #5c6ac4 0%, #4959bd 100%)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 10px 24px -8px rgba(73,89,189,0.5)',
          }}
        >
          <SlideIcon kind={slide.icon} />
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: '2.2rem',
            fontWeight: 700,
            color: '#212b36',
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
          }}
        >
          {slide.title}
        </h2>

        <p
          style={{
            marginTop: '1.2rem',
            fontSize: '1.4rem',
            lineHeight: '2.2rem',
            color: '#637381',
          }}
        >
          {slide.description}
        </p>

        {/* Step dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.6rem',
            marginTop: '2.8rem',
          }}
          aria-hidden="true"
        >
          {SLIDES.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === index ? '20px' : '8px',
                height: '8px',
                borderRadius: '999px',
                background: i === index ? '#5c6ac4' : '#dfe3e8',
                transition: 'width 140ms ease, background 140ms ease',
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '2.4rem',
            gap: '1.2rem',
          }}
        >
          <button
            type="button"
            onClick={skip}
            disabled={completing}
            style={{
              padding: '0.8rem 1.2rem',
              fontSize: '1.3rem',
              background: 'transparent',
              border: 'none',
              color: '#919eab',
              cursor: completing ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            Saltar
          </button>

          <div style={{ display: 'flex', gap: '0.8rem' }}>
            {index > 0 && (
              <button
                type="button"
                onClick={prev}
                disabled={completing}
                style={{
                  padding: '0.9rem 1.6rem',
                  fontSize: '1.3rem',
                  background: '#fff',
                  border: '1px solid #dfe3e8',
                  borderRadius: '8px',
                  color: '#454f5b',
                  cursor: completing ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={completing}
              style={{
                padding: '0.9rem 1.8rem',
                fontSize: '1.3rem',
                background: '#5c6ac4',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                cursor: completing ? 'wait' : 'pointer',
                fontWeight: 600,
                boxShadow: '0 2px 6px rgba(73,89,189,0.3)',
              }}
            >
              {isLast ? (completing ? 'Guardando…' : 'Empezar') : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideIcon({ kind }: { kind: Slide['icon'] }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'bullseye') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </svg>
    );
  }
  if (kind === 'flag') {
    return (
      <svg {...common}>
        <path d="M5 3v18" />
        <path d="M5 4h11l-2 4 2 4H5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M9 16l2 2 4-4" />
    </svg>
  );
}
