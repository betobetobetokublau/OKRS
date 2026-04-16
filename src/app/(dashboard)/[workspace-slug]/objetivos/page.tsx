'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useObjectivesTable } from '@/hooks/use-objectives-table';
import { ObjectivesTable } from '@/components/objectives/objectives-table';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { createClient } from '@/lib/supabase/client';
import { canManageContent } from '@/lib/utils/permissions';
import type { Department, ObjectiveStatus } from '@/types';

export default function ObjetivosPage() {
  const params = useParams();
  const slug = params['workspace-slug'] as string;
  const { currentWorkspace, activePeriod, userWorkspace } = useWorkspaceStore();
  const { rows, loading, refetch } = useObjectivesTable(currentWorkspace?.id, activePeriod?.id);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ObjectiveStatus | 'all'>('all');

  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  useEffect(() => {
    async function loadDepartments() {
      if (!currentWorkspace?.id) return;
      const supabase = createClient();
      const { data } = await supabase
        .from('departments')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('name', { ascending: true });
      if (data) setDepartments(data as Department[]);
    }
    loadDepartments();
  }, [currentWorkspace?.id]);

  const filtered = filterStatus === 'all' ? rows : rows.filter((o) => o.status === filterStatus);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Objetivos</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {activePeriod
              ? `Periodo ${activePeriod.name}. Haz clic en una fila para expandir las tareas.`
              : 'Sin periodo activo'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <Link
            href={`/${slug}/objetivos/skill-tree`}
            style={{
              padding: '0.8rem 1.6rem',
              fontSize: '1.4rem',
              fontWeight: 500,
              color: '#5c6ac4',
              backgroundColor: '#f4f5fc',
              border: 'none',
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            Skill Tree
          </Link>
          {canEdit && activePeriod && (
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              + Crear Objetivo
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '2rem' }}>
        {(['all', 'in_progress', 'upcoming', 'paused', 'deprecated'] as const).map((s) => {
          const labels = { all: 'Todos', in_progress: 'En progreso', upcoming: 'Próximos', paused: 'Pausados', deprecated: 'Deprecados' };
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '0.4rem 1.2rem',
                fontSize: '1.3rem',
                fontWeight: filterStatus === s ? 600 : 400,
                color: filterStatus === s ? '#5c6ac4' : '#637381',
                backgroundColor: filterStatus === s ? '#f4f5fc' : 'transparent',
                border: filterStatus === s ? '1px solid #5c6ac4' : '1px solid #dfe3e8',
                borderRadius: '20px',
                cursor: 'pointer',
              }}
            >
              {labels[s]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando objetivos...</p>
      ) : !activePeriod ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo.</p>
        </div>
      ) : (
        <ObjectivesTable
          rows={filtered}
          departments={departments}
          canEdit={canEdit}
          onChanged={refetch}
        />
      )}

      {showCreate && activePeriod && currentWorkspace && (
        <ObjectiveForm
          workspaceId={currentWorkspace.id}
          periodId={activePeriod.id}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}
