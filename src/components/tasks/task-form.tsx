'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AnimatedModal } from '@/components/common/animated-modal';
import type { Profile, Objective } from '@/types';

interface TaskFormProps {
  /**
   * Pre-selected parent objective. If omitted AND `allowObjectivePicker`
   * is true, the form renders a select so the user can pick one.
   */
  objectiveId?: string;
  /** If true and no objectiveId was passed, show a select of available objectives. */
  allowObjectivePicker?: boolean;
  /** When the picker is shown, constrain the options to this list (defaults to all objectives in the period). */
  pickableObjectives?: Objective[];
  workspaceId: string;
  periodId?: string;
  onClose: () => void;
  onSaved: () => void;
  initialData?: {
    id?: string;
    title?: string;
    description?: string;
    assigned_user_id?: string | null;
    due_date?: string | null;
    objective_id?: string;
  };
}

export function TaskForm({
  objectiveId,
  allowObjectivePicker,
  pickableObjectives,
  workspaceId,
  periodId,
  onClose,
  onSaved,
  initialData,
}: TaskFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    assigned_user_id: initialData?.assigned_user_id || '',
    due_date: initialData?.due_date || '',
    objective_id: initialData?.objective_id || objectiveId || '',
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [usersRes] = await Promise.all([
        supabase
          .from('user_workspaces')
          .select('profile:profiles(*)')
          .eq('workspace_id', workspaceId),
      ]);
      // Supabase typings can flatten the nested `profile` into an array in some
      // versions; accept either shape defensively.
      setUsers(
        ((usersRes.data || []) as Array<{ profile: Profile | Profile[] | null }>)
          .map((uw) => (Array.isArray(uw.profile) ? uw.profile[0] ?? null : uw.profile))
          .filter((p): p is Profile => Boolean(p)),
      );

      // Load objectives only if we need a picker and none were provided.
      if (allowObjectivePicker && !pickableObjectives && !objectiveId && periodId) {
        const { data } = await supabase
          .from('objectives')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('period_id', periodId)
          .order('title', { ascending: true });
        if (data) setObjectives(data as Objective[]);
      } else if (pickableObjectives) {
        setObjectives(pickableObjectives);
      }
    }
    load();
  }, [workspaceId, periodId, allowObjectivePicker, objectiveId, pickableObjectives]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetObjectiveId = form.objective_id || objectiveId;
    if (!targetObjectiveId) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      title: form.title,
      description: form.description || null,
      assigned_user_id: form.assigned_user_id || null,
      due_date: form.due_date || null,
    };

    if (initialData?.id) {
      await supabase.from('tasks').update(payload).eq('id', initialData.id);
    } else {
      await supabase.from('tasks').insert({
        ...payload,
        objective_id: targetObjectiveId,
        status: 'pending',
      });
    }
    setSaving(false);
    onSaved();
  }

  const showPicker = Boolean(allowObjectivePicker) && !objectiveId && !initialData?.id;

  return (
    <AnimatedModal open={true} onClose={onClose} width={460}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>{initialData?.id ? 'Editar tarea' : 'Nueva tarea'}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          {showPicker && (
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Objetivo</label>
              <select
                value={form.objective_id}
                onChange={(e) => setForm((p) => ({ ...p, objective_id: e.target.value }))}
                required
                style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
              >
                <option value="">Selecciona un objetivo</option>
                {objectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Título</label>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Descripción</label>
            <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Asignar a</label>
            <select value={form.assigned_user_id} onChange={(e) => setForm((p) => ({ ...p, assigned_user_id: e.target.value }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Fecha límite</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
          </div>
          <button type="submit" disabled={saving} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Guardando...' : initialData?.id ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}
