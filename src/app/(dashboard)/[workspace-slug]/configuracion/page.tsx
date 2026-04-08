'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';

export default function ConfiguracionPage() {
  const { currentWorkspace, setCurrentWorkspace } = useWorkspaceStore();
  const [form, setForm] = useState({ name: '', slug: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      setForm({ name: currentWorkspace.name, slug: currentWorkspace.slug });
    }
  }, [currentWorkspace]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace) return;
    setSaving(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('workspaces')
      .update({ name: form.name, slug: form.slug })
      .eq('id', currentWorkspace.id)
      .select()
      .single();

    if (data) {
      setCurrentWorkspace(data as any);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  return (
    <div>
      <div style={{ marginBottom: '2.4rem' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Configuración</h1>
        <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>Ajustes del workspace</p>
      </div>

      {saved && (
        <div style={{ padding: '1.2rem 1.6rem', borderRadius: '8px', backgroundColor: '#e3f1df', color: '#108043', fontSize: '1.3rem', marginBottom: '2rem', border: '1px solid #bbe5b3' }}>
          Configuración guardada exitosamente
        </div>
      )}

      <div className="Polaris-Card" style={{ padding: '2.4rem', borderRadius: '8px', border: '1px solid var(--color-border)', maxWidth: '560px' }}>
        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Nombre del workspace</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Slug (URL)</label>
              <input
                value={form.slug}
                onChange={e => setForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                required
                style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
              />
              <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.4rem' }}>
                La URL será: /{form.slug}
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{ alignSelf: 'flex-start', padding: '0.8rem 2.4rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
