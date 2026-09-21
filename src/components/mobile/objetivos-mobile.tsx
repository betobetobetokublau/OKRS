'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { UserAvatar } from '@/components/common/user-avatar';
import { StaticChip } from '@/components/okrs/inline-status-select';
import { objectiveStatusChip } from '@/components/okrs/status-chips';
import { calculateObjectiveProgress, getProgressColor } from '@/lib/utils/progress';
import { isPastDue } from '@/lib/utils/dates';
import type { ObjectiveRow } from '@/hooks/use-objectives-table';
import type { Department } from '@/types';

interface ObjetivosMobileProps {
  slug: string;
  rows: ObjectiveRow[];
  departments: Department[];
  periodName?: string;
  loading: boolean;
  profileId?: string;
  canCreate: boolean;
  onCreate: () => void;
}

type Scope = 'all' | 'mine' | `dept:${string}`;

/**
 * Phone version of /objetivos (design B1): flat list of objective cards with
 * filter chips (Todos · Míos · one per department). Each card links to the
 * full-page objective. The desktop page keeps its tabs (Listado, Gantt…).
 */
export function ObjetivosMobile({ slug, rows, departments, periodName, loading, profileId, canCreate, onCreate }: ObjetivosMobileProps) {
  const [scope, setScope] = useState<Scope>('all');

  const visible = useMemo(() => {
    return rows.filter((o) => {
      if (scope === 'mine') return Boolean(profileId) && o.responsible_user_id === profileId;
      if (scope.startsWith('dept:')) {
        const id = scope.slice(5);
        return o.responsible_department_id === id || (o.departments ?? []).some((d) => d.id === id);
      }
      return true;
    });
  }, [rows, scope, profileId]);

  const pills: Array<{ value: Scope; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'mine', label: 'Míos' },
    ...departments.map((d) => ({ value: `dept:${d.id}` as Scope, label: d.name })),
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.2rem', marginBottom: '1.2rem' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, color: '#212b36', margin: 0 }}>Objetivos</h1>
          {periodName && <p style={{ margin: '0.2rem 0 0', fontSize: '1.3rem', color: '#637381' }}>{periodName}</p>}
        </div>
        {canCreate && (
          <button type="button" onClick={onCreate} aria-label="Nuevo objetivo" style={{ padding: '0.6rem 1.2rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            +
          </button>
        )}
      </div>

      {/* Filter chips — horizontal scroll, no wrap */}
      <div role="tablist" aria-label="Filtro" style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.4rem', marginBottom: '1.2rem', scrollbarWidth: 'none' }}>
        {pills.map((p) => {
          const on = scope === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setScope(p.value)}
              style={{ flexShrink: 0, padding: '0.5rem 1.1rem', borderRadius: '99px', fontSize: '1.2rem', fontWeight: on ? 600 : 500, border: `1px solid ${on ? '#5c6ac4' : '#dfe3e8'}`, backgroundColor: on ? '#5c6ac4' : 'white', color: on ? 'white' : '#454f5b', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '3rem' }}>Cargando objetivos...</p>
      ) : visible.length === 0 ? (
        <p style={{ margin: 0, padding: '2rem', fontSize: '1.3rem', color: '#637381', borderRadius: '8px', border: '1px dashed #c4cdd5', backgroundColor: 'white', textAlign: 'center' }}>
          {rows.length === 0 ? 'Aún no hay objetivos en este periodo.' : 'Ningún objetivo coincide con el filtro.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {visible.map((o) => {
            const tasks = o.tasks ?? [];
            const pct = calculateObjectiveProgress(o, tasks);
            const overdue = tasks.filter((t) => t.status !== 'completed' && isPastDue(t.due_date)).length;
            const kpi = o.linked_kpis?.[0]?.title;
            const dept = o.responsible_department?.name ?? o.departments?.[0]?.name;
            return (
              <li key={o.id}>
                <Link href={`/${slug}/objetivos/${o.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', padding: '1.2rem 1.4rem' }}>
                  <div style={{ fontSize: '1.45rem', fontWeight: 600, color: '#212b36', lineHeight: 1.35, marginBottom: '0.6rem' }}>{o.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                    <StaticChip chip={objectiveStatusChip(o.status)} />
                    {dept && <span style={{ fontSize: '1.2rem', color: '#637381' }}>{dept}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: '#f1f2f4', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: getProgressColor(pct) }} />
                    </div>
                    <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '1.2rem', color: '#637381', minWidth: 0 }}>
                    {o.responsible_user && <UserAvatar user={o.responsible_user} size="small" />}
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}
                      {overdue > 0 && <span style={{ color: '#bf0711' }}> · {overdue} {overdue === 1 ? 'vencida' : 'vencidas'}</span>}
                      {kpi && ` · KPI: ${kpi}`}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
