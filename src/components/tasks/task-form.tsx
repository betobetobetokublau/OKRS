'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AnimatedModal } from '@/components/common/animated-modal';
import { addTaskToBoard } from '@/hooks/use-boards';
import { PRIORITY_OPTIONS } from '@/components/tasks/priority';
import { INPUT_STYLE, TEXTAREA_STYLE } from '@/lib/styles/form';
import type { Profile, Objective, TaskPriority } from '@/types';

interface TaskFormProps {
  /**
   * Pre-selected parent objective. If omitted AND `allowObjectivePicker`
   * is true, the form renders a select so the user can pick one (or none —
   * tasks may live without an OKR since boards landed).
   */
  objectiveId?: string;
  /** If true and no objectiveId was passed, show a select of available objectives. */
  allowObjectivePicker?: boolean;
  /** When the picker is shown, constrain the options to this list (defaults to all objectives in the period). */
  pickableObjectives?: Objective[];
  workspaceId: string;
  periodId?: string;
  /** When set, the new task is created as a subtask (checklist item) of this task. */
  parentTaskId?: string;
  /** After a successful insert, place the task on this board / section. */
  boardPlacement?: { boardId: string; sectionId: string | null };
  onClose: () => void;
  onSaved: () => void;
  initialData?: {
    id?: string;
    title?: string;
    description?: string;
    assigned_user_id?: string | null;
    due_date?: string | null;
    objective_id?: string | null;
    priority?: TaskPriority | null;
  };
}

const LABEL_STYLE = { display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' } as const;

export function TaskForm({
  objectiveId,
  allowObjectivePicker,
  pickableObjectives,
  workspaceId,
  periodId,
  parentTaskId,
  boardPlacement,
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
    priority: (initialData?.priority ?? '') as TaskPriority | '',
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const isEdit = Boolean(initialData?.id);
  // Picker stays hidden in edit mode (re-parenting happens from the detail panel).
  const showPicker = Boolean(allowObjectivePicker) && !objectiveId && !isEdit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetObjectiveId = form.objective_id || objectiveId || null;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      title: form.title,
      description: form.description || null,
      assigned_user_id: form.assigned_user_id || null,
      due_date: form.due_date || null,
      priority: form.priority || null,
    };

    if (initialData?.id) {
      const { error: updErr } = await supabase
        .from('tasks')
        .update(showPicker ? { ...payload, objective_id: targetObjectiveId } : payload)
        .eq('id', initialData.id);
      if (updErr) {
        setError(updErr.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('tasks')
        .insert({
          ...payload,
          workspace_id: workspaceId,
          objective_id: targetObjectiveId,
          parent_task_id: parentTaskId ?? null,
          status: 'pending',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        setError(insErr?.message ?? 'No se pudo crear la tarea');
        setSaving(false);
        return;
      }
      if (boardPlacement) {
        const { error: placeErr } = await addTaskToBoard(
          boardPlacement.boardId,
          (inserted as { id: string }).id,
          boardPlacement.sectionId,
        );
        if (placeErr) {
          setError(`La tarea se creó pero no se pudo añadir al tablero: ${placeErr.message}`);
          setSaving(false);
          return;
        }
      }
    }
    setSaving(false);
    onSaved();
  }

  const heading = isEdit ? 'Editar tarea' : parentTaskId ? 'Nueva subtarea' : 'Nueva tarea';

  return (
    <AnimatedModal open={true} onClose={onClose} width={460}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>{heading}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          {showPicker && (
            <div>
              <label htmlFor="task-form-objective" style={LABEL_STYLE}>Objetivo</label>
              <select
                id="task-form-objective"
                value={form.objective_id}
                onChange={(e) => setForm((p) => ({ ...p, objective_id: e.target.value }))}
                style={INPUT_STYLE}
              >
                <option value="">— Sin objetivo —</option>
                {objectives.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '1.2rem', color: '#919eab', marginTop: '0.4rem' }}>
                Sin objetivo la tarea vive solo en tableros / backlog y no suma al progreso de ningún OKR.
              </p>
            </div>
          )}
          <div>
            <label htmlFor="task-form-title" style={LABEL_STYLE}>Título</label>
            <input id="task-form-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required maxLength={200} style={INPUT_STYLE} />
          </div>
          <div>
            <label htmlFor="task-form-description" style={LABEL_STYLE}>Descripción</label>
            <textarea id="task-form-description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} maxLength={1000} style={TEXTAREA_STYLE} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div>
              <label htmlFor="task-form-priority" style={LABEL_STYLE}>Prioridad</label>
              <select
                id="task-form-priority"
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as TaskPriority | '' }))}
                style={INPUT_STYLE}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="task-form-due-date" style={LABEL_STYLE}>Fecha límite</label>
              <input id="task-form-due-date" type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} style={INPUT_STYLE} />
            </div>
          </div>
          <div>
            <label htmlFor="task-form-assigned-user" style={LABEL_STYLE}>Asignar a</label>
            <select id="task-form-assigned-user" value={form.assigned_user_id} onChange={(e) => setForm((p) => ({ ...p, assigned_user_id: e.target.value }))} style={INPUT_STYLE}>
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" style={{ fontSize: '1.3rem', color: '#bf0711', margin: 0 }}>{error}</p>
          )}
          <button type="submit" disabled={saving} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : parentTaskId ? 'Crear subtarea' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}
