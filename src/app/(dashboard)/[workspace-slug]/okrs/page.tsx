'use client';

import { useWorkspaceStore } from '@/stores/workspace-store';
import { useOkrs } from '@/hooks/use-okrs';
import { OkrsTable } from '@/components/okrs/okrs-table';

export default function OkrsPage() {
  const { currentWorkspace, activePeriod } = useWorkspaceStore();
  const { kpis, loading } = useOkrs(currentWorkspace?.id, activePeriod?.id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>OKRs</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            {activePeriod
              ? `Vista jerárquica del periodo ${activePeriod.name}. Haz clic en una fila para expandir.`
              : 'Sin periodo activo'}
          </p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando OKRs...</p>
      ) : !activePeriod ? (
        <div
          className="Polaris-Card"
          style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px solid var(--color-border)' }}
        >
          <p style={{ color: '#637381', fontSize: '1.4rem' }}>
            No hay un periodo activo. Un administrador debe crear y activar un periodo.
          </p>
        </div>
      ) : (
        <OkrsTable kpis={kpis} />
      )}
    </div>
  );
}
