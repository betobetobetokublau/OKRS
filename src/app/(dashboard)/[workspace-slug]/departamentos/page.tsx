'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { canManageContent } from '@/lib/utils/permissions';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Department } from '@/types';

export default function DepartamentosPage() {
  const params = useParams();
  const slug = params['workspace-slug'] as string;
  const { currentWorkspace, userWorkspace } = useWorkspaceStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id) loadDepartments();
  }, [currentWorkspace?.id]);

  async function loadDepartments() {
    const supabase = createClient();
    const { data } = await supabase.from('departments').select('*').eq('workspace_id', currentWorkspace!.id).order('name');
    setDepartments((data || []) as Department[]);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const supabase = createClient();
    await supabase.from('departments').insert({
      workspace_id: currentWorkspace!.id,
      name: form.name,
      color: form.color,
    });
    setShowCreate(false);
    setForm({ name: '', color: '#6366f1' });
    setCreating(false);
    loadDepartments();
  }

  const canEdit = userWorkspace && canManageContent(userWorkspace.role);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Departamentos</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>Organiza tu equipo por departamentos</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            + Crear departamento
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.6rem' }}>
        {loading ? (
          <p style={{ color: '#637381' }}>Cargando...</p>
        ) : departments.length === 0 ? (
          <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)', gridColumn: '1 / -1' }}>
            <p style={{ color: '#637381', fontSize: '1.4rem' }}>Aún no hay departamentos. ¡Crea el primero!</p>
          </div>
        ) : departments.map((dept) => (
          <Link key={dept.id} href={`/${slug}/departamentos/${dept.id}`} style={{ textDecoration: 'none' }}>
            <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: dept.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: dept.color }} />
                </div>
                <h3 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>{dept.name}</h3>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="Polaris-Card" style={{ width: '400px', padding: '2.4rem', borderRadius: '12px' }}>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>Crear departamento</h2>
                <button type="button" onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Nombre</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer' }} />
                    <span style={{ fontSize: '1.3rem', color: '#637381' }}>{form.color}</span>
                  </div>
                </div>
                <button type="submit" disabled={creating} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: creating ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: creating ? 'not-allowed' : 'pointer' }}>
                  {creating ? 'Creando...' : 'Crear departamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
