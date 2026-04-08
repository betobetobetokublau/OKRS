'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useKpis } from '@/hooks/use-kpis';
import { KPICard } from '@/components/kpis/kpi-card';
import { KPIForm } from '@/components/kpis/kpi-form';
import { canManageContent } from '@/lib/utils/permissions';
import { useRouter, useParams } from 'next/navigation';

export default function KPIsPage() {
  const params = useParams();
  const slug = params['workspace-slug'] as string;
  const router = useRouter();
  const { currentWorkspace, activePeriod, userWorkspace } = useWorkspaceStore();
  const { kpis, loading, refetch } = useKpis(currentWorkspace?.id, activePeriod?.id);
  const [showCreate, setShowCreate] = useState(false);

  const canEdit = userWorkspace && canManageContent(userWorkspace.role);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>KPIs</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {activePeriod ? `Periodo: ${activePeriod.name}` : 'Sin periodo activo'}
          </p>
        </div>
        {canEdit && activePeriod && (
          <button onClick={() => setShowCreate(true)} style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            + Crear KPI
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando KPIs...</p>
      ) : !activePeriod ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>No hay un periodo activo. Un administrador debe crear y activar un periodo.</p>
        </div>
      ) : kpis.length === 0 ? (
        <div className="Polaris-Card" style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>Aún no hay KPIs para este periodo. ¡Crea el primero!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.6rem' }}>
          {kpis.map((kpi) => (
            <KPICard key={kpi.id} kpi={kpi} onClick={() => router.push(`/${slug}/kpis/${kpi.id}`)} />
          ))}
        </div>
      )}

      {showCreate && activePeriod && currentWorkspace && (
        <KPIForm
          workspaceId={currentWorkspace.id}
          periodId={activePeriod.id}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}
