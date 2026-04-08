'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { UserAvatar } from '@/components/common/user-avatar';
import { ProgressBar } from '@/components/common/progress-bar';
import { StatusBadge } from '@/components/common/status-badge';
import type { Department, Profile, KPI, Objective } from '@/types';

export default function DepartamentoDetailPage() {
  const params = useParams();
  const deptId = params.id as string;
  const { currentWorkspace } = useWorkspaceStore();
  const [department, setDepartment] = useState<Department | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentWorkspace?.id && deptId) loadData();
  }, [currentWorkspace?.id, deptId]);

  async function loadData() {
    const supabase = createClient();

    const [deptRes, membersRes, kpiRes, objRes] = await Promise.all([
      supabase.from('departments').select('*').eq('id', deptId).single(),
      supabase.from('user_departments').select('*, profile:profiles(*)').eq('department_id', deptId),
      supabase.from('kpi_departments').select('kpi:kpis(*)').eq('department_id', deptId),
      supabase.from('objective_departments').select('objective:objectives(*)').eq('department_id', deptId),
    ]);

    if (deptRes.data) setDepartment(deptRes.data as Department);
    setMembers((membersRes.data || []).map((ud: any) => ud.profile) as Profile[]);
    setKpis((kpiRes.data || []).map((kd: any) => kd.kpi).filter(Boolean) as KPI[]);
    setObjectives((objRes.data || []).map((od: any) => od.objective).filter(Boolean) as Objective[]);
    setLoading(false);
  }

  if (loading || !department) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando departamento...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem', marginBottom: '2.4rem' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: department.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: department.color }} />
        </div>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>{department.name}</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>{members.length} miembros</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Members */}
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Miembros</h2>
          {members.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Sin miembros asignados</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {members.map((m) => (
                <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 0', borderBottom: '1px solid #f4f6f8' }}>
                  <UserAvatar user={m} size="small" />
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{m.full_name}</div>
                    <div style={{ fontSize: '1.2rem', color: '#637381' }}>{m.email}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* KPIs */}
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>KPIs del departamento</h2>
          {kpis.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Sin KPIs asignados</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {kpis.map((kpi) => (
                <li key={kpi.id} style={{ padding: '1rem 0', borderBottom: '1px solid #f4f6f8' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36', marginBottom: '0.4rem' }}>{kpi.title}</div>
                  <ProgressBar value={kpi.manual_progress} size="small" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Objectives */}
        <div className="Polaris-Card" style={{ padding: '2rem', borderRadius: '8px', border: '1px solid var(--color-border)', gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Objetivos del departamento</h2>
          {objectives.length === 0 ? (
            <p style={{ color: '#637381', fontSize: '1.3rem' }}>Sin objetivos asignados</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {objectives.map((obj) => (
                <li key={obj.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid #f4f6f8' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 500, color: '#212b36' }}>{obj.title}</div>
                    <div style={{ marginTop: '0.4rem', maxWidth: '300px' }}>
                      <ProgressBar value={obj.manual_progress} size="small" />
                    </div>
                  </div>
                  <StatusBadge status={obj.status} type="objective" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
