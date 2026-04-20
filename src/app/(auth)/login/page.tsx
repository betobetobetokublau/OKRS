'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Brand tokens (match src/app/globals.css + polaris.css)
const KUBLAU_PURPLE = '#5c6ac4';
const KUBLAU_PURPLE_DK = '#3f4eae';
const KUBLAU_INK = '#212b36';
const KUBLAU_SUB = '#637381';
const KUBLAU_BORDER = '#dfe3e8';
const KUBLAU_INPUT_BORDER = '#c4cdd5';

/**
 * Login — split-screen V2 ("product peek").
 *
 * Left: white column with form, left-aligned title, Kublau wordmark on top.
 * Right: soft pastel gradient (lavender → paper → peach) with radial blobs,
 *        eyebrow + large headline + floating product-peek card showing a
 *        mock Q2 OKR dashboard.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Credenciales incorrectas. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', user.id)
        .single();

      if (profile?.must_change_password) {
        router.push('/cambiar-password');
        return;
      }

      const { data: uw } = await supabase
        .from('user_workspaces')
        .select('workspace:workspaces(slug)')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const workspace = uw?.workspace as { slug: string } | undefined;
      if (workspace?.slug) {
        router.push(`/${workspace.slug}`);
        return;
      }
    }

    router.push('/');
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#f4f6f8',
      }}
    >
      {/* ─────── Left: form column ─────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem',
          backgroundColor: '#fff',
        }}
      >
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '4rem' }}>
            <KLogo size={36} />
            <span style={{ fontWeight: 600, fontSize: '1.5rem', color: KUBLAU_INK, letterSpacing: '-0.01em' }}>
              Kublau
            </span>
          </div>

          {/* Title block */}
          <div style={{ marginBottom: '2.8rem' }}>
            <h1
              style={{
                fontSize: '2.2rem',
                fontWeight: 600,
                lineHeight: '2.8rem',
                color: KUBLAU_INK,
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Inicia sesión
            </h1>
            <p style={{ color: KUBLAU_SUB, fontSize: '1.4rem', lineHeight: '2rem', marginTop: '0.4rem' }}>
              Bienvenido de vuelta. Continúa con tu cuenta de Kublau.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="Polaris-FormLayout"
            style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}
          >
            {error && <Banner>{error}</Banner>}

            <TextField
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="tu@empresa.com"
              autoFocus
              required
            />

            <TextField
              label="Contraseña"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="Tu contraseña"
              required
              right={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.4rem 0.8rem',
                    fontSize: '1.2rem',
                    fontWeight: 500,
                    color: KUBLAU_SUB,
                    fontFamily: 'inherit',
                  }}
                >
                  {showPw ? 'Ocultar' : 'Mostrar'}
                </button>
              }
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '-0.4rem',
              }}
            >
              <RememberMe checked={remember} onChange={setRemember} />
            </div>

            <PrimaryButton loading={loading}>
              {loading ? '' : 'Iniciar sesión'}
            </PrimaryButton>
          </form>

          <div style={{ marginTop: '2.8rem', fontSize: '1.3rem', color: KUBLAU_SUB }}>
            ¿No tienes cuenta?{' '}
            <span style={{ color: KUBLAU_PURPLE, fontWeight: 500 }}>Contacta al administrador</span>
          </div>
        </div>
      </div>

      {/* ─────── Right: product peek column ─────── */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(140deg, #e9ebf9 0%, #f4f6f8 55%, #fef4ee 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem',
          overflow: 'hidden',
        }}
      >
        {/* Soft purple radial blob (top-right) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            width: '52rem',
            height: '52rem',
            top: '-14rem',
            right: '-18rem',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(92,106,196,0.18), rgba(92,106,196,0) 70%)',
            pointerEvents: 'none',
          }}
        />
        {/* Soft orange radial blob (bottom-left) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            width: '46rem',
            height: '46rem',
            bottom: '-16rem',
            left: '-14rem',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(244,147,66,0.14), rgba(244,147,66,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '44rem' }}>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: KUBLAU_PURPLE_DK,
              marginBottom: '1.4rem',
            }}
          >
            Tu trimestre, en claro
          </div>
          <div
            style={{
              fontSize: '3rem',
              lineHeight: '3.6rem',
              fontWeight: 600,
              color: KUBLAU_INK,
              letterSpacing: '-0.02em',
              marginBottom: '2.8rem',
              maxWidth: '40rem',
            }}
          >
            Equipos alineados, avances visibles, decisiones más rápidas.
          </div>
          <ProductPeek />
        </div>
      </div>
    </div>
  );
}

// ───────── Components ─────────

function KLogo({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: KUBLAU_PURPLE,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"SF Mono", ui-monospace, Menlo, monospace',
        fontWeight: 600,
        fontSize: size * 0.5,
        color: 'white',
        letterSpacing: '-0.04em',
      }}
    >
      K
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="Polaris-Banner Polaris-Banner--statusCritical"
      style={{
        padding: '1.2rem',
        borderRadius: '4px',
        background: '#fbeae5',
        color: '#bf0711',
        fontSize: '1.3rem',
        lineHeight: '1.8rem',
        border: '1px solid #e3b5af',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="#bf0711" style={{ flex: 'none', marginTop: '1px' }}>
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 7.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

interface TextFieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  right?: React.ReactNode;
}

function TextField({ label, type = 'text', value, onChange, placeholder, autoFocus, required, right }: TextFieldProps) {
  const [focus, setFocus] = useState(false);
  return (
    <div className="Polaris-FormLayout__Item">
      <div className="Polaris-Labelled__LabelWrapper">
        <label
          className="Polaris-Label"
          style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, color: KUBLAU_INK, marginBottom: '0.6rem' }}
        >
          {label}
        </label>
      </div>
      <div className="Polaris-TextField" style={{ position: 'relative' }}>
        <input
          className="Polaris-TextField__Input"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required={required}
          style={{
            width: '100%',
            padding: '0.9rem 1.2rem',
            paddingRight: right ? '7rem' : '1.2rem',
            fontSize: '1.4rem',
            lineHeight: '2rem',
            color: KUBLAU_INK,
            background: '#fff',
            border: `1px solid ${focus ? KUBLAU_PURPLE : KUBLAU_INPUT_BORDER}`,
            borderRadius: '4px',
            outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxShadow: focus ? `0 0 0 1px ${KUBLAU_PURPLE}` : 'none',
            fontFamily: 'inherit',
          }}
        />
        {right}
      </div>
    </div>
  );
}

function RememberMe({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.8rem',
        cursor: 'pointer',
        fontSize: '1.3rem',
        color: KUBLAU_SUB,
        userSelect: 'none',
        position: 'relative',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          width: '1.6rem',
          height: '1.6rem',
          border: `1px solid ${checked ? KUBLAU_PURPLE : KUBLAU_INPUT_BORDER}`,
          background: checked ? KUBLAU_PURPLE : '#fff',
          borderRadius: '3px',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 120ms',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M1 5l3 3 5-6"
              stroke="white"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      Recordarme
    </label>
  );
}

function PrimaryButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const bg = hover && !loading
    ? 'linear-gradient(to bottom, #5c6ac4, #4959bd)'
    : 'linear-gradient(to bottom, #6371c7, #5563c1)';
  return (
    <button
      type="submit"
      className={`Polaris-Button Polaris-Button--primary ${loading ? 'Polaris-Button--loading' : ''} Polaris-Button--fullWidth`}
      disabled={loading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '3.6rem',
        padding: '0.9rem 1.6rem',
        fontSize: '1.5rem',
        fontWeight: 600,
        color: 'white',
        background: bg,
        border: '1px solid #3f4eae',
        borderRadius: '3px',
        boxShadow: 'inset 0 1px 0 0 #6774c8, 0 1px 0 0 rgba(22,29,37,0.05)',
        cursor: loading ? 'default' : 'pointer',
        transition: 'background 200ms cubic-bezier(.64,0,.35,1), box-shadow 200ms',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ opacity: loading ? 0 : 1, transition: 'opacity 120ms' }}>{children}</span>
      {loading && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '1.8rem',
            height: '1.8rem',
            marginLeft: '-0.9rem',
            marginTop: '-0.9rem',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.35)',
            borderTopColor: 'white',
            animation: 'login-spin 0.7s linear infinite',
          }}
        />
      )}
      <style jsx>{`
        @keyframes login-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </button>
  );
}

// ───────── Product peek card ─────────

function ProductPeek() {
  const rows = [
    { label: 'Lanzar v2 del producto', pct: 82, color: '#50b83c' },
    { label: 'NPS ≥ 55', pct: 64, color: '#5c6ac4' },
    { label: 'Reducir churn 30%', pct: 41, color: '#f49342' },
    { label: 'Activar 120 nuevas cuentas', pct: 28, color: '#de3618' },
  ];
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '10px',
        boxShadow:
          '0 30px 60px -20px rgba(32,38,94,0.35), 0 10px 30px -10px rgba(32,38,94,0.25)',
        border: `1px solid ${KUBLAU_BORDER}`,
        padding: '2.2rem',
        width: '38rem',
        fontSize: '1.2rem',
        color: KUBLAU_INK,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.8rem',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '1.05rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: KUBLAU_SUB,
              fontWeight: 600,
            }}
          >
            Q2 · 2026
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.2rem' }}>
            Objetivos del trimestre
          </div>
        </div>
        <div
          style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            padding: '0.3rem 0.8rem',
            background: '#e4e5f4',
            color: KUBLAU_PURPLE_DK,
            borderRadius: '3px',
          }}
        >
          54% · en progreso
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
        {rows.map((r, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <div style={{ fontWeight: 500 }}>{r.label}</div>
              <div style={{ color: KUBLAU_SUB, fontVariantNumeric: 'tabular-nums' }}>{r.pct}%</div>
            </div>
            <div style={{ height: '0.6rem', borderRadius: '3px', background: '#eef0f2', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${r.pct}%`,
                  height: '100%',
                  background: r.color,
                  borderRadius: '3px',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '2rem',
          paddingTop: '1.6rem',
          borderTop: `1px dashed ${KUBLAU_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: '2.6rem',
            height: '2.6rem',
            borderRadius: '50%',
            background: KUBLAU_PURPLE,
            color: 'white',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          AR
        </div>
        <div style={{ fontSize: '1.15rem' }}>
          <span style={{ fontWeight: 600 }}>Alberto</span>
          <span style={{ color: KUBLAU_SUB }}> hizo check-in hace 2h</span>
        </div>
      </div>
    </div>
  );
}
