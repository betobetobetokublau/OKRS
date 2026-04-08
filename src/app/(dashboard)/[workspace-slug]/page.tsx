'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import type { KPI, Objective, Task } from '@/types';

interface DashboardStats {
  totalKpis: number;
  totalObjectives: number;
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  avgKpiProgress: number;
  avgObjectiveProgress: number;
  recentObjectives: Objective[];
  recentTasks: Task[];
}

export default function DashboardPage() {
  const { currentWorkspace, activePeriod } = useWorkspaceStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      if (!currentWorkspace?.id || !activePeriod?.id) return;
      const supabase = createClient();

      const [kpisRes, objectivesRes, tasksRes] = await Promise.all([
        supabase.from('kpis').select('*, manual_progress').eq('workspace_id', currentWorkspace.id).eq('period_id', activePeriod.id),
        supabase.from('objectives').select('*, manual_progress, status').eq('workspace_id', currentWorkspace.id).eq('period_id', activePeriod.id).order('created_at', { ascending: false }),
        supabase.from('tasks').select('*, objective:objectives!tasks_objective_id_fkey(workspace_id, period_id)').order('created_at', { ascending: false }),
      ]);

      const kpis = (kpisRes.data || []) as KPI[];
      const objectives = (objectivesRes.data || []) as Objective[];
      const allTasks = ((tasksRes.data || []) as (Task & { objective: { workspace_id: string; period_id: string } })[])
        .filter(t => t.objective?.workspace_id === currentWorkspace.id && t.objective?.period_id === activePeriod.id);

      const avgKpi = kpis.length > 0
        ? Math.round(kpis.reduce((s, k) => s + k.manual_progress, 0) / kpis.length)
        : 0;
      const avgObj = objectives.length > 0
        ? Math.round(objectives.reduce((s, o) => s + o.manual_progress, 0) / objectives.length)
        : 0;

      setStats({
        totalKpis: kpis.length,
        totalObjectives: objectives.length,
        totalTasks: allTasks.length,
        completedTasks: allTasks.filter(t => t.status === 'completed').length,
        blockedTasks: allTasks.filter(t => t.status === 'blocked').length,
        avgKpiProgress: avgKpi,
        avgObjectiveProgress: avgObj,
        recentObjectives: objectives.slice(0, 5),
        recentTasks: allTasks.slice(0, 5) as Task[],
      });
      setLoading(false);
    }

    loadDashboard();
  }, [currentWorkspace?.id, activePeriod?.id]);

  if (loading || !stats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <span style={{ color: '#637381', fontSize: '1.4rem' }}>Cargando dashboard...</span>
      </div>
    );
  }

  const statCards = [
    { label: 'KPIs', value: stats.totalKpis, color: '#5c6ac4', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6' },
    { label: 'Objetivos', value: stats.totalObjectives, color: '#47c1bf', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Tareas completadas', value: `${stats.completedTasks}/${stats.totalTasks}`, color: '#50b83c', icon: 'M5 13l4 4L19 7' },
    { label: 'Tareas bloqueadas', value: stats.blockedTasks, color: '#de3618', icon: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '2.4rem' }}>
        <h1 className="Polaris-Heading" style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>
          Dashboard
        </h1>
        {activePeriod && (
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            Periodo activo: {activePeriod.name}
          </p>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.6rem', marginBottom: '2.4rem' }}>
        {statCards.map((card) => (
          <div
            key={card.label}
            className="Polaris-Card"
            style={{
              padding: '2rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: card.color + '15',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={card.icon} />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#212b36' }}>{card.value}</div>
                <div style={{ fontSize: '1.2rem', color: '#637381' }}>{card.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Progress overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.6rem', marginBottom: '2.4rem' }}>
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>
            Progreso promedio de KPIs
          </h2>
          <ProgressBar value={stats.avgKpiProgress} size="large" />
        </div>
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>
            Progreso promedio de Objetivos
          </h2>
          <ProgressBar value={stats.avgObjectiveProgress} size="large" />
        </div>
      </div>

      {/* Recent objectives */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.6rem' }}>
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>
            Objetivos recientes
          </h2>
          {stats.recentObjectives.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Aún no hay objetivos para este periodo.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {stats.recentObjectives.map((obj) => (
                <li
                  key={obj.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.8rem 0',
                    borderBottom: '1px solid #f4f6f8',
                  }}
                >
                  <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{obj.title}</span>
                  <StatusBadge status={obj.status} type="objective" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>
            Tareas recientes
          </h2>
          {stats.recentTasks.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Aún no hay tareas para este periodo.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {stats.recentTasks.map((task) => (
                <li
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.8rem 0',
                    borderBottom: '1px solid #f4f6f8',
                  }}
                >
                  <span style={{ fontSize: '1.3rem', color: '#212b36' }}>{task.title}</span>
                  <StatusBadge status={task.status} type="task" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
