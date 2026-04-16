'use client';

import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useOkrs } from '@/hooks/use-okrs';
import { OkrsTable } from '@/components/okrs/okrs-table';
import { createClient } from '@/lib/supabase/client';
import { canManageContent } from '@/lib/utils/permissions';
import type { Department } from '@/types';

export default function OkrsPage() {
  const { currentWorkspace, activePeriod, userWorkspace } = useWorkspaceStore();
  const { kpis, loading, refetch } = useOkrs(currentWorkspace?.id, activePeriod?.id);
  const [departments, setDepartments] = useState<Department[]>([]);

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
        <OkrsTable
          kpis={kpis}
          departments={departments}
          canEdit={canEdit}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
