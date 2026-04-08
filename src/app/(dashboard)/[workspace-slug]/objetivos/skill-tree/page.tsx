'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useSkillTreeStore } from '@/stores/skill-tree-store';
import { SkillTreeCanvas } from '@/components/skill-tree/skill-tree-canvas';
import { TreeControls } from '@/components/skill-tree/tree-controls';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import type { Department, KPI, Objective, Task } from '@/types';

export default function SkillTreePage() {
  const params = useParams();
  const slug = params['workspace-slug'] as string;
  const router = useRouter();
  const { currentWorkspace, activePeriod } = useWorkspaceStore();
  const { viewMode, setSelectedNode } = useSkillTreeStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [drawerData, setDrawerData] = useState<{ type: string; data: any } | null>(null);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const supabase = createClient();
    Promise.all([
      supabase.from('departments').select('*').eq('workspace_id', currentWorkspace.id),
      supabase.from('kpis').select('*').eq('workspace_id', currentWorkspace.id).eq('period_id', activePeriod?.id || ''),
      supabase.from('objectives').select('*, tasks(*)').eq('workspace_id', currentWorkspace.id).eq('period_id', activePeriod?.id || ''),
    ]).then(([d, k, o]) => {
      setDepartments((d.data || []) as Department[]);
      setKpis((k.data || []) as KPI[]);
      setObjectives((o.data || []) as Objective[]);
    });
  }, [currentWorkspace?.id, activePeriod?.id]);

  async function handleNodeClick(type: string, id: string) {
    const supabase = createClient();
    if (type === 'kpi') {
      const { data } = await supabase.from('kpis').select('*').eq('id', id).single();
      setDrawerData({ type: 'kpi', data });
    } else if (type === 'obj') {
      const { data } = await supabase.from('objectives').select('*, tasks(*)').eq('id', id).single();
      setDrawerData({ type: 'objective', data });
    } else if (type === 'task') {
      const { data } = await supabase.from('tasks').select('*, objective:objectives(title)').eq('id', id).single();
      setDrawerData({ type: 'task', data });
    }
    setSelectedNode(id);
  }

  if (!currentWorkspace || !activePeriod) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Skill Tree</h1>
      </div>

      <TreeControls departments={departments} kpis={kpis} />

      {viewMode === 'tree' ? (
        <SkillTreeCanvas
          workspaceId={currentWorkspace.id}
          periodId={activePeriod.id}
          onNodeClick={handleNodeClick}
        />
      ) : (
        /* Table view */
        <div className="Polaris-Card" style={{ borderRadius: '8px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1.3rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '1rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase' }}>KPI</th>
                <th style={{ padding: '1rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase' }}>Objetivo</th>
                <th style={{ padding: '1rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase' }}>Estado</th>
                <th style={{ padding: '1rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase' }}>Progreso</th>
                <th style={{ padding: '1rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase' }}>Tareas</th>
              </tr>
            </thead>
            <tbody>
              {objectives.map((obj) => (
                <tr key={obj.id} style={{ borderTop: '1px solid #f4f6f8', cursor: 'pointer' }} onClick={() => router.push(`/${slug}/objetivos/${obj.id}`)}>
                  <td style={{ padding: '1rem 1.6rem', color: '#637381' }}>
                    {kpis.find(k => k.id === obj.id)?.title || '—'}
                  </td>
                  <td style={{ padding: '1rem 1.6rem', fontWeight: 500, color: '#212b36' }}>{obj.title}</td>
                  <td style={{ padding: '1rem 1.6rem' }}><StatusBadge status={obj.status} type="objective" /></td>
                  <td style={{ padding: '1rem 1.6rem', minWidth: '120px' }}><ProgressBar value={obj.manual_progress} size="small" /></td>
                  <td style={{ padding: '1rem 1.6rem', color: '#637381' }}>{obj.tasks?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {drawerData && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', backgroundColor: 'var(--color-surface)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', zIndex: 200, overflowY: 'auto', padding: '2.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>
              {drawerData.type === 'kpi' ? 'KPI' : drawerData.type === 'objective' ? 'Objetivo' : 'Tarea'}
            </h2>
            <button onClick={() => { setDrawerData(null); setSelectedNode(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
          </div>

          <h3 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', marginBottom: '1.2rem' }}>{drawerData.data?.title}</h3>

          {drawerData.data?.description && (
            <p style={{ fontSize: '1.3rem', color: '#637381', lineHeight: '1.6', marginBottom: '1.6rem' }}>{drawerData.data.description}</p>
          )}

          {drawerData.data?.status && (
            <div style={{ marginBottom: '1.2rem' }}>
              <StatusBadge status={drawerData.data.status} type={drawerData.type === 'task' ? 'task' : 'objective'} />
            </div>
          )}

          {drawerData.data?.manual_progress !== undefined && (
            <div style={{ marginBottom: '1.6rem' }}>
              <p style={{ fontSize: '1.2rem', color: '#637381', marginBottom: '0.4rem' }}>Progreso</p>
              <ProgressBar value={drawerData.data.manual_progress} size="medium" />
            </div>
          )}

          {drawerData.data?.tasks && drawerData.data.tasks.length > 0 && (
            <div>
              <p style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36', marginBottom: '0.8rem' }}>Tareas ({drawerData.data.tasks.length})</p>
              {drawerData.data.tasks.map((t: Task) => (
                <div key={t.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid #f4f6f8', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <StatusBadge status={t.status} type="task" />
                  <span style={{ fontSize: '1.2rem', color: '#212b36' }}>{t.title}</span>
                </div>
              ))}
            </div>
          )}

          {drawerData.data?.block_reason && (
            <div style={{ padding: '1rem', backgroundColor: '#fbeae5', borderRadius: '6px', marginTop: '1rem' }}>
              <p style={{ fontSize: '1.2rem', color: '#bf0711' }}>Motivo de bloqueo: {drawerData.data.block_reason}</p>
            </div>
          )}

          <button
            onClick={() => {
              if (drawerData.type === 'kpi') router.push(`/${slug}/kpis/${drawerData.data.id}`);
              else if (drawerData.type === 'objective') router.push(`/${slug}/objetivos/${drawerData.data.id}`);
            }}
            style={{ marginTop: '2rem', width: '100%', padding: '0.8rem', fontSize: '1.3rem', fontWeight: 500, color: '#5c6ac4', backgroundColor: '#f4f5fc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Ver detalle completo
          </button>
        </div>
      )}
    </div>
  );
}
