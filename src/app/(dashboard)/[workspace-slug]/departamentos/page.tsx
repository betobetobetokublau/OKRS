'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { canManageContent } from '@/lib/utils/permissions';
import type { Department } from '@/types';

interface DepartmentRow extends Department {
  member_count: number;
  kpi_count: number;
  objective_count: number;
}

/**
 * Departamentos view: one row per department with aggregate counts so
 * admins can see at a glance where people / OKRs are concentrated.
 */
export default function DepartamentosPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params['workspace-slug'] as string;
  const { currentWorkspace, userWorkspace } = useWorkspaceStore();
  const [rows, setRows] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#6366f1' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id) loadDepartments();
  }, [currentWorkspace?.id]);

  async function loadDepartments() {
    setLoading(true);
    const supabase = createClient();
    const { data: depts } = await supabase
      .from('departments')
      .select('*')
      .eq('workspace_id', currentWorkspace!.id)
      .order('name');
    const deptList = (depts || []) as Department[];

    if (deptList.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const deptIds = deptList.map((d) => d.id);

    // Aggregate counts in parallel. We count:
    //   - members: rows in user_departments
    //   - KPIs with this dept as responsible OR linked via kpi_departments
    //   - Objectives with this dept as responsible OR linked via objective_departments
    const [udRes, kdRes, kRespRes, odRes, oRespRes] = await Promise.all([
      supabase.from('user_departments').select('department_id').in('department_id', deptIds),
      supabase.from('kpi_departments').select('department_id').in('department_id', deptIds),
      supabase.from('kpis').select('id, responsible_department_id').in('responsible_department_id', deptIds),
      supabase.from('objective_departments').select('department_id').in('department_id', deptIds),
      supabase.from('objectives').select('id, responsible_department_id').in('responsible_department_id', deptIds),
    ]);

    function tally(list: Array<{ department_id: string }> | null): Map<string, number> {
      const m = new Map<string, number>();
      (list || []).forEach((r) => m.set(r.department_id, (m.get(r.department_id) || 0) + 1));
      return m;
    }
    function tallyBy<T extends { responsible_department_id: string | null }>(
      list: T[] | null,
    ): Map<string, number> {
      const m = new Map<string, number>();
      (list || []).forEach((r) => {
        if (!r.responsible_department_id) return;
        m.set(r.responsible_department_id, (m.get(r.responsible_department_id) || 0) + 1);
      });
      return m;
    }

    const members = tally(udRes.data as Array<{ department_id: string }> | null);
    const kpiLinks = tally(kdRes.data as Array<{ department_id: string }> | null);
    const kpiResp = tallyBy((kRespRes.data || []) as Array<{ id: string; responsible_department_id: string | null }>);
    const objLinks = tally(odRes.data as Array<{ department_id: string }> | null);
    const objResp = tallyBy((oRespRes.data || []) as Array<{ id: string; responsible_department_id: string | null }>);

    const enriched: DepartmentRow[] = deptList.map((d) => ({
      ...d,
      member_count: members.get(d.id) || 0,
      kpi_count: (kpiLinks.get(d.id) || 0) + (kpiResp.get(d.id) || 0),
      objective_count: (objLinks.get(d.id) || 0) + (objResp.get(d.id) || 0),
    }));

    setRows(enriched);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const supabase = createClient();
    await supabase.from('departments').insert({
      workspace_id: currentWorkspace!.id,
      name: form.name,
      color: form.color,
    });
    setShowCreate(false);
    setForm({ name: '', color: '#6366f1' });
    setCreating(false);
    loadDepartments();
  }

  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  const headerCell: React.CSSProperties = {
    padding: '1.2rem 1.6rem',
    textAlign: 'left',
    fontSize: '1.2rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#637381',
    borderBottom: '1px solid #dfe3e8',
    backgroundColor: '#fafbfb',
  };
  const cellBase: React.CSSProperties = {
    padding: '1.2rem 1.6rem',
    borderBottom: '1px solid #f1f2f4',
    fontSize: '1.4rem',
    color: '#212b36',
    verticalAlign: 'middle',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Departamentos</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            Organiza tu equipo por departamentos
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            + Crear departamento
          </button>
        )}
      </div>

      <div
        className="Polaris-Card"
        style={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'white', overflow: 'hidden' }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...headerCell, width: '40%' }}>Nombre</th>
              <th style={headerCell}>Color</th>
              <th style={headerCell}>Miembros</th>
              <th style={headerCell}>KPIs</th>
              <th style={headerCell}>Objetivos</th>
              <th style={headerCell}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ ...cellBase, textAlign: 'center', color: '#637381', padding: '3rem' }}>Cargando...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...cellBase, textAlign: 'center', color: '#637381', padding: '3rem' }}>
                  Aún no hay departamentos.
                </td>
              </tr>
            ) : (
              rows.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/${slug}/departamentos/${d.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={cellBase}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          backgroundColor: d.color + '20',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: d.color }} />
                      </div>
                      <Link
                        href={`/${slug}/departamentos/${d.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '1.4rem', fontWeight: 600, color: '#212b36', textDecoration: 'none' }}
                      >
                        {d.name}
                      </Link>
                    </div>
                  </td>
                  <td style={cellBase}>
                    <code style={{ fontSize: '1.2rem', color: '#637381' }}>{d.color}</code>
                  </td>
                  <td style={cellBase}>{d.member_count}</td>
                  <td style={cellBase}>{d.kpi_count}</td>
                  <td style={cellBase}>{d.objective_count}</td>
                  <td style={cellBase}>
                    <Link
                      href={`/${slug}/departamentos/${d.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: '1.3rem', color: '#5c6ac4', textDecoration: 'none' }}
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="Polaris-Card" style={{ width: '400px', padding: '2.4rem', borderRadius: '12px' }}>
            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>Crear departamento</h2>
                <button type="button" onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Nombre</label>
                  <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer' }} />
                    <span style={{ fontSize: '1.3rem', color: '#637381' }}>{form.color}</span>
                  </div>
                </div>
                <button type="submit" disabled={creating} style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: creating ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: creating ? 'not-allowed' : 'pointer' }}>
                  {creating ? 'Creando...' : 'Crear departamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
