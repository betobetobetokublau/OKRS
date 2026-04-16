'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Department, Profile, Objective, ProgressMode, KPIStatus } from '@/types';

interface KPIFormProps {
  workspaceId: string;
  periodId: string;
  onClose: () => void;
  onSaved: () => void;
  initialData?: {
    id?: string;
    title?: string;
    description?: string;
    progress_mode?: ProgressMode;
    manual_progress?: number;
    status?: KPIStatus;
    responsible_user_id?: string | null;
    responsible_department_id?: string | null;
  };
}

export function KPIForm({ workspaceId, periodId, onClose, onSaved, initialData }: KPIFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    progress_mode: initialData?.progress_mode || 'hybrid' as ProgressMode,
    manual_progress: initialData?.manual_progress || 0,
    status: initialData?.status || 'on_track' as KPIStatus,
    responsible_user_id: initialData?.responsible_user_id || '',
    responsible_department_id: initialData?.responsible_department_id || '',
    department_ids: [] as string[],
    objective_ids: [] as string[],
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const supabase = createClient();
      const [usersRes, deptsRes, objsRes] = await Promise.all([
        supabase.from('user_workspaces').select('profile:profiles(*)').eq('workspace_id', workspaceId),
        supabase.from('departments').select('*').eq('workspace_id', workspaceId),
        supabase.from('objectives').select('*').eq('workspace_id', workspaceId).eq('period_id', periodId),
      ]);
      setUsers((usersRes.data || []).map((uw: any) => uw.profile).filter(Boolean));
      setDepartments((deptsRes.data || []) as Department[]);
      setObjectives((objsRes.data || []) as Objective[]);

      if (initialData?.id) {
        const [kdRes, koRes] = await Promise.all([
          supabase.from('kpi_departments').select('department_id').eq('kpi_id', initialData.id),
          supabase.from('kpi_objectives').select('objective_id').eq('kpi_id', initialData.id),
        ]);
        setForm(prev => ({
          ...prev,
          department_ids: (kdRes.data || []).map((r: any) => r.department_id),
          objective_ids: (koRes.data || []).map((r: any) => r.objective_id),
        }));
      }
    }
    loadOptions();
  }, [workspaceId, periodId, initialData?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();

    const kpiData = {
      title: form.title,
      description: form.description || null,
      progress_mode: form.progress_mode,
      manual_progress: form.manual_progress,
      status: form.status,
      responsible_user_id: form.responsible_user_id || null,
      responsible_department_id: form.responsible_department_id || null,
      workspace_id: workspaceId,
      period_id: periodId,
    };

    let kpiId = initialData?.id;

    if (kpiId) {
      await supabase.from('kpis').update(kpiData).eq('id', kpiId);
    } else {
      const { data } = await supabase.from('kpis').insert(kpiData).select('id').single();
      kpiId = data?.id;
    }

    if (kpiId) {
      // Sync departments
      await supabase.from('kpi_departments').delete().eq('kpi_id', kpiId);
      if (form.department_ids.length > 0) {
        await supabase.from('kpi_departments').insert(
          form.department_ids.map(did => ({ kpi_id: kpiId!, department_id: did }))
        );
      }
      // Sync objectives
      await supabase.from('kpi_objectives').delete().eq('kpi_id', kpiId);
      if (form.objective_ids.length > 0) {
        await supabase.from('kpi_objectives').insert(
          form.objective_ids.map(oid => ({ kpi_id: kpiId!, objective_id: oid }))
        );
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
            <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>{initialData?.id ? 'Editar KPI' : 'Crear KPI'}</h2>
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
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Modo de progreso</label>
              <select value={form.progress_mode} onChange={e => setForm(p => ({ ...p, progress_mode: e.target.value as ProgressMode }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="manual">Manual</option>
                <option value="auto">Automático (basado en objetivos)</option>
                <option value="hybrid">Híbrido (promedio manual + auto)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Estado</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as KPIStatus }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="on_track">On track</option>
                <option value="at_risk">En riesgo</option>
                <option value="off_track">Off track</option>
                <option value="achieved">Logrado</option>
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
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Departamentos vinculados</label>
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
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Objetivos vinculados</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
                {objectives.map(o => (
                  <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.3rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.objective_ids.includes(o.id)} onChange={e => setForm(p => ({ ...p, objective_ids: e.target.checked ? [...p.objective_ids, o.id] : p.objective_ids.filter(id => id !== o.id) }))} />
                    {o.title}
                  </label>
                ))}
                {objectives.length === 0 && <span style={{ color: '#637381', fontSize: '1.2rem' }}>No hay objetivos en este periodo</span>}
              </div>
            </div>

            <button type="submit" disabled={saving} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando...' : initialData?.id ? 'Guardar cambios' : 'Crear KPI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
