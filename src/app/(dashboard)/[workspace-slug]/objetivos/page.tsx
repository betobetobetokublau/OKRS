'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useObjectives } from '@/hooks/use-objectives';
import { ObjectiveCard } from '@/components/objectives/objective-card';
import { ObjectiveForm } from '@/components/objectives/objective-form';
import { canManageContent } from '@/lib/utils/permissions';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import type { ObjectiveStatus } from '@/types';

export default function ObjetivosPage() {
  const params = useParams();
  const slug = params['workspace-slug'] as string;
  const router = useRouter();
  const { currentWorkspace, activePeriod, userWorkspace } = useWorkspaceStore();
  const { objectives, loading, refetch } = useObjectives(currentWorkspace?.id, activePeriod?.id);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ObjectiveStatus | 'all'>('all');

  const canEdit = userWorkspace && canManageContent(userWorkspace.role);
  const filtered = filterStatus === 'all' ? objectives : objectives.filter(o => o.status === filterStatus);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Objetivos</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {activePeriod ? `Periodo: ${activePeriod.name}` : 'Sin periodo activo'}
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
            <button onClick={() => setShowCreate(true)} style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
      ) : filtered.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>
            {filterStatus === 'all' ? 'Aún no hay objetivos para este periodo. ¡Crea el primero!' : 'No hay objetivos con este filtro.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.6rem' }}>
          {filtered.map((obj) => (
            <ObjectiveCard key={obj.id} objective={obj} onClick={() => router.push(`/${slug}/objetivos/${obj.id}`)} />
          ))}
        </div>
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
