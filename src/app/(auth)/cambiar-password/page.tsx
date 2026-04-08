'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError('Error al actualizar la contraseña. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    // Mark password as changed
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);

      // Navigate to first workspace
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
            backgroundColor: '#f49342',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.6rem',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1 className="Polaris-Heading" style={{ fontSize: '2rem', fontWeight: 600, color: '#212b36' }}>
          Cambiar contraseña
        </h1>
        <p style={{ color: '#637381', marginTop: '0.4rem', fontSize: '1.4rem' }}>
          Debes cambiar tu contraseña temporal antes de continuar
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, color: '#212b36', marginBottom: '0.4rem' }}>
              Nueva contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              style={{
                width: '100%',
                padding: '0.8rem 1.2rem',
                fontSize: '1.4rem',
                border: '1px solid #c4cdd5',
                borderRadius: '4px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, color: '#212b36', marginBottom: '0.4rem' }}>
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              required
              style={{
                width: '100%',
                padding: '0.8rem 1.2rem',
                fontSize: '1.4rem',
                border: '1px solid #c4cdd5',
                borderRadius: '4px',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.4rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: loading ? '#d9a470' : '#f49342',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '0.8rem',
            }}
          >
            {loading ? 'Actualizando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </div>
  );
}
