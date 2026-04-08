'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { formatDate } from '@/lib/utils/dates';
import type { Period, PeriodStatus } from '@/types';

export default function PeriodosPage() {
  const { currentWorkspace, setActivePeriod } = useWorkspaceStore();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id) loadPeriods();
  }, [currentWorkspace?.id]);

  async function loadPeriods() {
    const supabase = createClient();
    const { data } = await supabase
      .from('periods')
      .select('*')
      .eq('workspace_id', currentWorkspace!.id)
      .order('start_date', { ascending: false });
    setPeriods((data || []) as Period[]);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const supabase = createClient();
    await supabase.from('periods').insert({
      workspace_id: currentWorkspace!.id,
      name: form.name,
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'upcoming' as PeriodStatus,
    });
    setShowCreateModal(false);
    setForm({ name: '', start_date: '', end_date: '' });
    setCreating(false);
    loadPeriods();
  }

  async function handleActivate(periodId: string) {
    const supabase = createClient();
    // Deactivate current active period
    await supabase.from('periods').update({ status: 'upcoming' }).eq('workspace_id', currentWorkspace!.id).eq('status', 'active');
    // Activate selected
    const { data } = await supabase.from('periods').update({ status: 'active' }).eq('id', periodId).select().single();
    if (data) setActivePeriod(data as Period);
    loadPeriods();
  }

  async function handleArchive(periodId: string) {
    const supabase = createClient();
    await supabase.from('periods').update({ status: 'archived' }).eq('id', periodId);
    loadPeriods();
  }

  const statusStyles: Record<PeriodStatus, { label: string; color: string; bg: string }> = {
    active: { label: 'Activo', color: '#108043', bg: '#e3f1df' },
    upcoming: { label: 'Próximo', color: '#006fbb', bg: '#ebf5fa' },
    archived: { label: 'Archivado', color: '#637381', bg: '#f4f6f8' },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Periodos</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>Gestiona los periodos trimestrales</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          + Crear periodo
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        {loading ? (
          <p style={{ color: '#637381', textAlign: 'center', padding: '2rem' }}>Cargando...</p>
        ) : periods.length === 0 ? (
          <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <p style={{ color: '#637381', fontSize: '1.4rem' }}>Aún no hay periodos. ¡Crea el primero!</p>
          </div>
        ) : periods.map((period) => {
          const st = statusStyles[period.status];
          return (
            <div key={period.id} className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
                  <h3 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>{period.name}</h3>
                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '1.2rem', fontWeight: 500, color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                </div>
                <p style={{ fontSize: '1.3rem', color: '#637381' }}>
                  {formatDate(period.start_date)} — {formatDate(period.end_date)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                {period.status === 'upcoming' && (
                  <button
                    onClick={() => handleActivate(period.id)}
                    style={{ padding: '0.6rem 1.2rem', fontSize: '1.3rem', fontWeight: 500, color: '#108043', backgroundColor: '#e3f1df', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Activar
                  </button>
                )}
                {period.status === 'active' && (
                  <button
                    onClick={() => handleArchive(period.id)}
                    style={{ padding: '0.6rem 1.2rem', fontSize: '1.3rem', fontWeight: 500, color: '#bf0711', backgroundColor: '#fbeae5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Archivar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="Polaris-Card" style={{ width: '420px', padding: '2.4rem', borderRadius: '12px' }}>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>Crear periodo</h2>
                <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Nombre</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Q2 2026" required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Fecha inicio</label>
                    <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Fecha fin</label>
                    <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                  </div>
                </div>
                <button type="submit" disabled={creating} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: creating ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: creating ? 'not-allowed' : 'pointer' }}>
                  {creating ? 'Creando...' : 'Crear periodo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
