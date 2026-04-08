'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Credenciales incorrectas. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    // Check if must change password
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
    }

    // Get first workspace
    if (user) {
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
    <div className="Polaris-Card" style={{ width: '100%', maxWidth: '420px', padding: '3.2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.4rem' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            backgroundColor: '#5c6ac4',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.6rem',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h1 className="Polaris-Heading" style={{ fontSize: '2rem', fontWeight: 600, color: '#212b36' }}>
          Plataforma OKRs
        </h1>
        <p style={{ color: '#637381', marginTop: '0.4rem', fontSize: '1.4rem' }}>
          Inicia sesión para continuar
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="Polaris-Banner Polaris-Banner--statusCritical"
            style={{
              padding: '1.2rem',
              borderRadius: '4px',
              backgroundColor: '#fbeae5',
              color: '#bf0711',
              fontSize: '1.3rem',
              marginBottom: '1.6rem',
              border: '1px solid #e3b5af',
            }}
          >
            {error}
          </div>
        )}

        <div className="Polaris-FormLayout" style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          <div className="Polaris-FormLayout__Item">
            <div className="Polaris-Labelled__LabelWrapper">
              <label
                className="Polaris-Label"
                style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, color: '#212b36', marginBottom: '0.4rem' }}
              >
                Correo electrónico
              </label>
            </div>
            <div className="Polaris-TextField">
              <input
                className="Polaris-TextField__Input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                required
                style={{
                  width: '100%',
                  padding: '0.8rem 1.2rem',
                  fontSize: '1.4rem',
                  border: '1px solid #c4cdd5',
                  borderRadius: '4px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>
          </div>

          <div className="Polaris-FormLayout__Item">
            <div className="Polaris-Labelled__LabelWrapper">
              <label
                className="Polaris-Label"
                style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, color: '#212b36', marginBottom: '0.4rem' }}
              >
                Contraseña
              </label>
            </div>
            <div className="Polaris-TextField">
              <input
                className="Polaris-TextField__Input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                required
                style={{
                  width: '100%',
                  padding: '0.8rem 1.2rem',
                  fontSize: '1.4rem',
                  border: '1px solid #c4cdd5',
                  borderRadius: '4px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>
          </div>

          <button
            className="Polaris-Button Polaris-Button--primary"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: loading ? '#8c92c4' : '#5c6ac4',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              marginTop: '0.8rem',
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </div>
      </form>
    </div>
  );
}
