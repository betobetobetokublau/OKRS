'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Department, Profile, KPI, ProgressMode, ObjectiveStatus } from '@/types';

interface ObjectiveFormProps {
  workspaceId: string;
  periodId: string;
  onClose: () => void;
  onSaved: () => void;
  initialData?: {
    id?: string;
    title?: string;
    description?: string;
    status?: ObjectiveStatus;
    progress_mode?: ProgressMode;
    manual_progress?: number;
    responsible_user_id?: string | null;
    responsible_department_id?: string | null;
    /** Pre-selected KPI links (used when creating from a KPI panel). */
    kpi_ids?: string[];
  };
}

export function ObjectiveForm({ workspaceId, periodId, onClose, onSaved, initialData }: ObjectiveFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    status: initialData?.status || 'upcoming' as ObjectiveStatus,
    progress_mode: initialData?.progress_mode || 'hybrid' as ProgressMode,
    manual_progress: initialData?.manual_progress || 0,
    responsible_user_id: initialData?.responsible_user_id || '',
    responsible_department_id: initialData?.responsible_department_id || '',
    department_ids: [] as string[],
    kpi_ids: (initialData?.kpi_ids ?? []) as string[],
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const supabase = createClient();
      const [usersRes, deptsRes, kpisRes] = await Promise.all([
        supabase.from('user_workspaces').select('profile:profiles(*)').eq('workspace_id', workspaceId),
        supabase.from('departments').select('*').eq('workspace_id', workspaceId),
        supabase.from('kpis').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId),
      ]);
      setUsers((usersRes.data || []).map((uw: any) => uw.profile).filter(Boolean));
      setDepartments((deptsRes.data || []) as Department[]);
      setKpis((kpisRes.data || []) as KPI[]);

      if (initialData?.id) {
        const [odRes, koRes] = await Promise.all([
          supabase.from('objective_departments').select('department_id').eq('objective_id', initialData.id),
          supabase.from('kpi_objectives').select('kpi_id').eq('objective_id', initialData.id),
        ]);
        setForm(prev => ({
          ...prev,
          department_ids: (odRes.data || []).map((r: any) => r.department_id),
          kpi_ids: (koRes.data || []).map((r: any) => r.kpi_id),
        }));
      }
    }
    loadOptions();
  }, [workspaceId, periodId, initialData?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const objData = {
      title: form.title,
      description: form.description || null,
      status: form.status,
      progress_mode: form.progress_mode,
      manual_progress: form.manual_progress,
      responsible_user_id: form.responsible_user_id || null,
      responsible_department_id: form.responsible_department_id || null,
      workspace_id: workspaceId,
      period_id: periodId,
    };

    let objId = initialData?.id;

    if (objId) {
      await supabase.from('objectives').update(objData).eq('id', objId);
    } else {
      const { data } = await supabase.from('objectives').insert(objData).select('id').single();
      objId = data?.id;
    }

    if (objId) {
      await supabase.from('objective_departments').delete().eq('objective_id', objId);
      if (form.department_ids.length > 0) {
        await supabase.from('objective_departments').insert(form.department_ids.map(did => ({ objective_id: objId!, department_id: did })));
      }
      await supabase.from('kpi_objectives').delete().eq('objective_id', objId);
      if (form.kpi_ids.length > 0) {
        await supabase.from('kpi_objectives').insert(form.kpi_ids.map(kid => ({ kpi_id: kid, objective_id: objId! })));
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="Polaris-Card" style={{ width: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '2.4rem', borderRadius: '12px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>{initialData?.id ? 'Editar Objetivo' : 'Crear Objetivo'}</h2>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Título</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Descripción</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', resize: 'vertical' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Estado</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as ObjectiveStatus }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="upcoming">Próximo</option>
                <option value="in_progress">En progreso</option>
                <option value="paused">Pausado</option>
                <option value="deprecated">Deprecado</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Modo de progreso</label>
              <select value={form.progress_mode} onChange={e => setForm(p => ({ ...p, progress_mode: e.target.value as ProgressMode }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="manual">Manual</option>
                <option value="auto">Automático (basado en tareas)</option>
                <option value="hybrid">Híbrido (promedio manual + auto)</option>
              </select>
            </div>

            {(form.progress_mode === 'manual' || form.progress_mode === 'hybrid') && (
              <div>
                <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Progreso manual: {form.manual_progress}%</label>
                <input type="range" min={0} max={100} value={form.manual_progress} onChange={e => setForm(p => ({ ...p, manual_progress: Number(e.target.value) }))} style={{ width: '100%' }} />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Responsable (usuario)</label>
              <select value={form.responsible_user_id} onChange={e => setForm(p => ({ ...p, responsible_user_id: e.target.value, responsible_department_id: e.target.value ? '' : p.responsible_department_id }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Responsable (departamento)</label>
              <select value={form.responsible_department_id} onChange={e => setForm(p => ({ ...p, responsible_department_id: e.target.value, responsible_user_id: e.target.value ? '' : p.responsible_user_id }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="">Sin asignar</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Departamentos</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                {departments.map(d => (
                  <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.3rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.department_ids.includes(d.id)} onChange={e => setForm(p => ({ ...p, department_ids: e.target.checked ? [...p.department_ids, d.id] : p.department_ids.filter(id => id !== d.id) }))} />
                    <span style={{ color: d.color }}>{d.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>KPIs vinculados</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
                {kpis.map(k => (
                  <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.3rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.kpi_ids.includes(k.id)} onChange={e => setForm(p => ({ ...p, kpi_ids: e.target.checked ? [...p.kpi_ids, k.id] : p.kpi_ids.filter(id => id !== k.id) }))} />
                    {k.title}
                  </label>
                ))}
                {kpis.length === 0 && <span style={{ color: '#637381', fontSize: '1.2rem' }}>No hay KPIs en este periodo</span>}
              </div>
            </div>

            <button type="submit" disabled={saving} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando...' : initialData?.id ? 'Guardar cambios' : 'Crear Objetivo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
