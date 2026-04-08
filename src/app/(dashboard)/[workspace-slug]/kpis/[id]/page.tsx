'use client';

import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { KPIDetail } from '@/components/kpis/kpi-detail';

export default function KPIDetailPage() {
  const params = useParams();
  const kpiId = params.id as string;
  const { currentWorkspace } = useWorkspaceStore();

  if (!currentWorkspace) {
    return <div style={{ padding: '2rem', color: '#637381' }}>Cargando...</div>;
  }

  return <KPIDetail kpiId={kpiId} workspaceId={currentWorkspace.id} />;
}
