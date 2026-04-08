'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { formatMonthYear } from '@/lib/utils/dates';
import type { Objective, Task, TaskStatus } from '@/types';

interface ReviewObjective {
  objective: Objective;
  tasks: Task[];
  newProgress: number;
  comment: string;
}

export default function RevisionMensualPage() {
  const { currentWorkspace, activePeriod, profile } = useWorkspaceStore();
  const [reviewItems, setReviewItems] = useState<ReviewObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadReviewData() {
      if (!currentWorkspace?.id || !activePeriod?.id || !profile?.id) return;
      const supabase = createClient();

      // Get objectives where user is responsible or has assigned tasks
      const { data: objectives } = await supabase
        .from('objectives')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('period_id', activePeriod.id);

      const items: ReviewObjective[] = [];

      for (const obj of (objectives || []) as Objective[]) {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('*, assigned_user:profiles!tasks_assigned_user_id_fkey(*)')
          .eq('objective_id', obj.id);

        const userTasks = ((tasks || []) as Task[]).filter(
          t => t.assigned_user_id === profile.id || obj.responsible_user_id === profile.id
        );

        if (userTasks.length > 0 || obj.responsible_user_id === profile.id) {
          items.push({
            objective: obj,
            tasks: (tasks || []) as Task[],
            newProgress: obj.manual_progress,
            comment: '',
          });
        }
      }

      setReviewItems(items);
      setLoading(false);
    }

    loadReviewData();
  }, [currentWorkspace?.id, activePeriod?.id, profile?.id]);

  async function handleTaskStatusChange(objIndex: number, taskId: string, newStatus: TaskStatus) {
    const supabase = createClient();
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);

    setReviewItems(prev => prev.map((item, i) => {
      if (i !== objIndex) return item;
      return {
        ...item,
        tasks: item.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t),
      };
    }));
  }

  async function handleSaveAll() {
    if (!profile?.id || !currentWorkspace?.id || !activePeriod?.id) return;
    setSaving(true);
    const supabase = createClient();

    for (const item of reviewItems) {
      // Update objective manual progress
      if (item.newProgress !== item.objective.manual_progress) {
        await supabase.from('objectives').update({ manual_progress: item.newProgress }).eq('id', item.objective.id);
      }

      // Create progress log
      await supabase.from('progress_logs').insert({
        user_id: profile.id,
        period_id: activePeriod.id,
        workspace_id: currentWorkspace.id,
        objective_id: item.objective.id,
        progress_value: item.newProgress,
        note: item.comment || null,
      });

      // Create comment if provided
      if (item.comment.trim()) {
        await supabase.from('comments').insert({
          user_id: profile.id,
          objective_id: item.objective.id,
          content: item.comment.trim(),
        });
      }
    }

    setSaving(false);
    setSaved(true);
  }

  return (
    <div>
      <div style={{ marginBottom: '2.4rem' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Revisión Mensual</h1>
        <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
          {formatMonthYear(new Date())} — Actualiza el progreso de tus objetivos y tareas
        </p>
      </div>

      {saved && (
        <div style={{ padding: '1.6rem', borderRadius: '8px', backgroundColor: '#e3f1df', color: '#108043', fontSize: '1.4rem', marginBottom: '2rem', border: '1px solid #bbe5b3' }}>
          Revisión mensual guardada exitosamente. Tus actualizaciones han sido registradas.
        </div>
      )}

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando datos de revisión...</p>
      ) : reviewItems.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No tienes objetivos o tareas asignadas para revisar.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {reviewItems.map((item, index) => (
              <div key={item.objective.id} className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                {/* Objective header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.6rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>{item.objective.title}</h2>
                    <StatusBadge status={item.objective.status} type="objective" />
                  </div>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: '#5c6ac4' }}>{item.newProgress}%</span>
                </div>

                {/* Progress slider */}
                <div style={{ marginBottom: '1.6rem' }}>
                  <label style={{ display: 'block', fontSize: '1.3rem', fontWeight: 500, color: '#637381', marginBottom: '0.4rem' }}>
                    Progreso manual
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={item.newProgress}
                    onChange={(e) => setReviewItems(prev => prev.map((r, i) => i === index ? { ...r, newProgress: Number(e.target.value) } : r))}
                    style={{ width: '100%' }}
                  />
                  <ProgressBar value={item.newProgress} showLabel={false} size="medium" />
                </div>

                {/* Tasks */}
                {item.tasks.length > 0 && (
                  <div style={{ marginBottom: '1.6rem' }}>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 500, color: '#212b36', marginBottom: '0.8rem' }}>Tareas</h3>
                    {item.tasks.map((task) => (
                      <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 0', borderBottom: '1px solid #f4f6f8' }}>
                        <select
                          value={task.status}
                          onChange={(e) => handleTaskStatusChange(index, task.id, e.target.value as TaskStatus)}
                          style={{ padding: '0.3rem 0.4rem', fontSize: '1.2rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
                        >
                          <option value="pending">Pendiente</option>
                          <option value="in_progress">En progreso</option>
                          <option value="completed">Completada</option>
                          <option value="blocked">Bloqueada</option>
                        </select>
                        <span style={{ fontSize: '1.3rem', color: task.status === 'completed' ? '#637381' : '#212b36', textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment */}
                <div>
                  <label style={{ display: 'block', fontSize: '1.3rem', fontWeight: 500, color: '#637381', marginBottom: '0.4rem' }}>Comentario (opcional)</label>
                  <textarea
                    value={item.comment}
                    onChange={(e) => setReviewItems(prev => prev.map((r, i) => i === index ? { ...r, comment: e.target.value } : r))}
                    placeholder="Notas sobre el avance de este objetivo..."
                    rows={2}
                    style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px', resize: 'vertical' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {!saved && (
            <div style={{ marginTop: '2rem', textAlign: 'right' }}>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                style={{ padding: '1rem 3.2rem', fontSize: '1.6rem', fontWeight: 600, color: 'white', backgroundColor: saving ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Guardando revisión...' : 'Guardar revisión mensual'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
