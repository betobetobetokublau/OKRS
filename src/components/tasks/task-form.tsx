'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

interface TaskFormProps {
  objectiveId: string;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
  initialData?: {
    id?: string;
    title?: string;
    description?: string;
    assigned_user_id?: string | null;
    due_date?: string | null;
  };
}

export function TaskForm({ objectiveId, workspaceId, onClose, onSaved, initialData }: TaskFormProps) {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    assigned_user_id: initialData?.assigned_user_id || '',
    due_date: initialData?.due_date || '',
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadUsers() {
      const supabase = createClient();
      const { data } = await supabase.from('user_workspaces').select('profile:profiles(*)').eq('workspace_id', workspaceId);
      setUsers((data || []).map((uw: any) => uw.profile).filter(Boolean));
    }
    loadUsers();
  }, [workspaceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        objective_id: objectiveId,
        status: 'pending',
      });
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="Polaris-Card" style={{ width: '460px', padding: '2.4rem', borderRadius: '12px' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>{initialData?.id ? 'Editar tarea' : 'Nueva tarea'}</h2>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Título</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Descripción</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Asignar a</label>
              <select value={form.assigned_user_id} onChange={e => setForm(p => ({ ...p, assigned_user_id: e.target.value }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Fecha límite</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
            </div>
            <button type="submit" disabled={saving} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando...' : initialData?.id ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
