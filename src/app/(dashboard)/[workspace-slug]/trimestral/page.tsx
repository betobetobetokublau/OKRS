'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { canExportPdf } from '@/lib/utils/permissions';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import { formatRelative } from '@/lib/utils/dates';
import type { KPI, Objective, Task, Department, Comment } from '@/types';

interface DeptSummary {
  department: Department;
  kpis: KPI[];
  objectives: Objective[];
  avgProgress: number;
}

export default function TrimestralPage() {
  const { currentWorkspace, activePeriod, userWorkspace } = useWorkspaceStore();
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deptSummaries, setDeptSummaries] = useState<DeptSummary[]>([]);
  const [recentComments, setRecentComments] = useState<(Comment & { user: any })[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);

  useEffect(() => {
    // If we don't yet have a workspace / period, don't sit in the "loading"
    // state forever — flip loading off and render the empty state below. This
    // used to leave the page stuck on "Cargando dashboard trimestral..." on
    // workspaces without an active period.
    if (!currentWorkspace?.id || !activePeriod?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadData();
  }, [currentWorkspace?.id, activePeriod?.id]);

  async function loadData() {
    const supabase = createClient();
    const wsId = currentWorkspace!.id;
    const pId = activePeriod!.id;

    const [kpisR, objsR, deptsR, commR] = await Promise.all([
      supabase.from('kpis').select('*').eq('workspace_id', wsId).eq('period_id', pId),
      supabase.from('objectives').select('*, tasks(*)').eq('workspace_id', wsId).eq('period_id', pId),
      supabase.from('departments').select('*').eq('workspace_id', wsId),
      supabase.from('comments').select('*, user:profiles(*)').order('created_at', { ascending: false }).limit(20),
    ]);

    const k = (kpisR.data || []) as KPI[];
    const o = (objsR.data || []) as Objective[];
    const allTasks = o.flatMap(ob => (ob.tasks || []) as Task[]);
    const depts = (deptsR.data || []) as Department[];

    setKpis(k);
    setObjectives(o);
    setTasks(allTasks);
    setRecentComments((commR.data || []) as any[]);

    // Dept summaries — simplified: just group by responsible department
    const summaries: DeptSummary[] = depts.map(d => {
      const dKpis = k.filter(ki => ki.responsible_department_id === d.id);
      const dObjs = o.filter(ob => ob.responsible_department_id === d.id);
      const allProgress = [...dKpis.map(ki => ki.manual_progress), ...dObjs.map(ob => ob.manual_progress)];
      const avg = allProgress.length > 0 ? Math.round(allProgress.reduce((s, v) => s + v, 0) / allProgress.length) : 0;
      return { department: d, kpis: dKpis, objectives: dObjs, avgProgress: avg };
    }).filter(s => s.kpis.length > 0 || s.objectives.length > 0);

    setDeptSummaries(summaries);
    setLoading(false);
  }

  // Keyboard navigation for presentation mode
  useEffect(() => {
    if (!fullscreen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setSectionIndex(p => Math.min(p + 1, 4));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setSectionIndex(p => Math.max(p - 1, 0));
      if (e.key === 'Escape') setFullscreen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [fullscreen]);

  async function handleExportPDF() {
    setExporting(true);
    const res = await fetch('/api/exportar/trimestral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: currentWorkspace!.id, period_id: activePeriod!.id }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-trimestral-${activePeriod!.name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', color: '#637381' }}>Cargando dashboard trimestral...</div>;

  if (!activePeriod) {
    return (
      <div>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Dashboard Trimestral</h1>
        <div
          className="Polaris-Card"
          style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)', marginTop: '2.4rem' }}
        >
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>
            No hay un periodo activo. Un administrador debe crear y activar un periodo.
          </p>
        </div>
      </div>
    );
  }

  const avgKpiProgress = kpis.length > 0 ? Math.round(kpis.reduce((s, k) => s + k.manual_progress, 0) / kpis.length) : 0;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const canExport = userWorkspace && canExportPdf(userWorkspace.role);

  const objByStatus = {
    in_progress: objectives.filter(o => o.status === 'in_progress'),
    paused: objectives.filter(o => o.status === 'paused'),
    deprecated: objectives.filter(o => o.status === 'deprecated'),
    upcoming: objectives.filter(o => o.status === 'upcoming'),
  };

  // Presentation mode
  if (fullscreen) {
    const sections = [
      /* 0: Overview */ (
        <div key="overview" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '4rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>Resumen Trimestral</h1>
          <p style={{ fontSize: '2rem', color: 'rgba(255,255,255,0.7)' }}>{currentWorkspace?.name} — {activePeriod?.name}</p>
          <div style={{ fontSize: '8rem', fontWeight: 800, color: '#5c6ac4', marginTop: '3rem' }}>{avgKpiProgress}%</div>
          <p style={{ fontSize: '1.8rem', color: 'rgba(255,255,255,0.6)' }}>Progreso promedio de KPIs</p>
        </div>
      ),
      /* 1: KPIs */ (
        <div key="kpis">
          <h2 style={{ fontSize: '3rem', fontWeight: 700, color: 'white', marginBottom: '2rem' }}>KPIs</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {kpis.map(k => (
              <div key={k.id} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '2rem' }}>
                <h3 style={{ color: 'white', fontSize: '1.6rem', marginBottom: '1rem' }}>{k.title}</h3>
                <ProgressBar value={k.manual_progress} size="large" />
              </div>
            ))}
          </div>
        </div>
      ),
      /* 2: Departments */ (
        <div key="depts">
          <h2 style={{ fontSize: '3rem', fontWeight: 700, color: 'white', marginBottom: '2rem' }}>Por Departamento</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {deptSummaries.map(s => (
              <div key={s.department.id} style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: s.department.color }} />
                  <h3 style={{ color: 'white', fontSize: '1.6rem' }}>{s.department.name}</h3>
                </div>
                <ProgressBar value={s.avgProgress} size="large" />
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem', marginTop: '0.8rem' }}>{s.kpis.length} KPIs, {s.objectives.length} objetivos</p>
              </div>
            ))}
          </div>
        </div>
      ),
      /* 3: Blocked */ (
        <div key="blocked">
          <h2 style={{ fontSize: '3rem', fontWeight: 700, color: 'white', marginBottom: '2rem' }}>Tareas Bloqueadas ({blockedTasks.length})</h2>
          {blockedTasks.map(t => (
            <div key={t.id} style={{ backgroundColor: 'rgba(222,54,24,0.15)', borderRadius: '8px', padding: '1.6rem', marginBottom: '1rem', borderLeft: '4px solid #de3618' }}>
              <h3 style={{ color: 'white', fontSize: '1.6rem' }}>{t.title}</h3>
              {t.block_reason && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.3rem', marginTop: '0.4rem' }}>{t.block_reason}</p>}
            </div>
          ))}
          {blockedTasks.length === 0 && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.8rem' }}>Sin tareas bloqueadas</p>}
        </div>
      ),
      /* 4: Summary */ (
        <div key="summary" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '3rem', fontWeight: 700, color: 'white', marginBottom: '2rem' }}>Resumen</h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4rem' }}>
            <div><div style={{ fontSize: '5rem', fontWeight: 800, color: '#5c6ac4' }}>{kpis.length}</div><p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.4rem' }}>KPIs</p></div>
            <div><div style={{ fontSize: '5rem', fontWeight: 800, color: '#47c1bf' }}>{objectives.length}</div><p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.4rem' }}>Objetivos</p></div>
            <div><div style={{ fontSize: '5rem', fontWeight: 800, color: '#50b83c' }}>{completedTasks}/{tasks.length}</div><p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.4rem' }}>Tareas completadas</p></div>
          </div>
        </div>
      ),
    ];

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#0d1117', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
        <button onClick={() => setFullscreen(false)} style={{ position: 'absolute', top: '2rem', right: '2rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '1.4rem', cursor: 'pointer' }}>
          ESC para salir
        </button>
        <div style={{ position: 'absolute', bottom: '2rem', display: 'flex', gap: '0.6rem' }}>
          {sections.map((_, i) => (
            <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: i === sectionIndex ? '#5c6ac4' : 'rgba(255,255,255,0.2)', cursor: 'pointer' }} onClick={() => setSectionIndex(i)} />
          ))}
        </div>
        <div style={{ width: '100%', maxWidth: '1200px' }}>{sections[sectionIndex]}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Dashboard Trimestral</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>{activePeriod?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button onClick={() => { setFullscreen(true); setSectionIndex(0); }} style={{ padding: '0.8rem 1.6rem', fontSize: '1.3rem', fontWeight: 500, color: '#5c6ac4', backgroundColor: '#f4f5fc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Modo presentación
          </button>
          {canExport && (
            <button onClick={handleExportPDF} disabled={exporting} style={{ padding: '0.8rem 1.6rem', fontSize: '1.3rem', fontWeight: 600, color: 'white', backgroundColor: exporting ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: exporting ? 'not-allowed' : 'pointer' }}>
              {exporting ? 'Exportando...' : 'Exportar PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Global progress */}
      <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>Progreso global de KPIs</h2>
          <span style={{ fontSize: '2.4rem', fontWeight: 700, color: '#5c6ac4' }}>{avgKpiProgress}%</span>
        </div>
        <ProgressBar value={avgKpiProgress} size="large" showLabel={false} />
        <div style={{ display: 'flex', gap: '2rem', marginTop: '1.2rem' }}>
          <span style={{ fontSize: '1.3rem', color: '#637381' }}>{kpis.length} KPIs</span>
          <span style={{ fontSize: '1.3rem', color: '#637381' }}>{objectives.length} Objetivos</span>
          <span style={{ fontSize: '1.3rem', color: '#637381' }}>{completedTasks}/{tasks.length} Tareas completadas</span>
          <span style={{ fontSize: '1.3rem', color: '#de3618' }}>{blockedTasks.length} Bloqueadas</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        {/* By department */}
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Por departamento</h2>
          {deptSummaries.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Sin datos por departamento</p>
          ) : deptSummaries.map(s => (
            <div key={s.department.id} style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: s.department.color }} />
                <span style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{s.department.name}</span>
                <span style={{ fontSize: '1.2rem', color: '#637381', marginLeft: 'auto' }}>{s.avgProgress}%</span>
              </div>
              <ProgressBar value={s.avgProgress} size="small" showLabel={false} />
            </div>
          ))}
        </div>

        {/* Objectives by status */}
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Objetivos por estado</h2>
          {Object.entries(objByStatus).map(([status, objs]) => objs.length > 0 && (
            <div key={status} style={{ marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <StatusBadge status={status as any} type="objective" />
                <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>{objs.length}</span>
              </div>
              {objs.slice(0, 3).map(o => (
                <div key={o.id} style={{ fontSize: '1.2rem', color: '#637381', padding: '0.2rem 0' }}>• {o.title}</div>
              ))}
              {objs.length > 3 && <div style={{ fontSize: '1.2rem', color: '#919eab' }}>+{objs.length - 3} más</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Blocked tasks & recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Tareas bloqueadas ({blockedTasks.length})</h2>
          {blockedTasks.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Sin tareas bloqueadas</p>
          ) : blockedTasks.map(t => (
            <div key={t.id} style={{ padding: '0.8rem 0', borderBottom: '1px solid #f4f6f8' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{t.title}</div>
              {t.block_reason && <div style={{ fontSize: '1.2rem', color: '#bf0711', marginTop: '0.2rem' }}>{t.block_reason}</div>}
            </div>
          ))}
        </div>

        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Actividad reciente</h2>
          {recentComments.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Sin actividad reciente</p>
          ) : recentComments.slice(0, 10).map(c => (
            <div key={c.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid #f4f6f8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 500, color: '#212b36' }}>{c.user?.full_name}</span>
                <span style={{ fontSize: '1.1rem', color: '#919eab' }}>{formatRelative(c.created_at)}</span>
              </div>
              <div style={{ fontSize: '1.2rem', color: '#637381' }}>{c.content.slice(0, 80)}{c.content.length > 80 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
