'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canManageContent } from '@/lib/utils/permissions';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { KpiDetailPanelBody } from '@/components/okrs/kpi-detail-panel-body';
import type { Department } from '@/types';

interface KPIDetailProps {
  kpiId: string;
  workspaceId: string;
}

/**
 * Full-page view for `/{workspace}/kpis/[id]`. Delegates the content to the
 * Asana-style shell shared with the slide-in panel. Only adds a page-level
 * width constraint + departments preloading.
 */
export function KPIDetail({ kpiId, workspaceId }: KPIDetailProps) {
  const { userWorkspace } = useWorkspaceStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('departments')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true });
      if (data) setDepartments(data as Department[]);
    }
    load();
  }, [workspaceId]);

  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <KpiDetailPanelBody
        kpiId={kpiId}
        departments={departments}
        canEdit={canEdit}
        onChanged={() => setRefreshKey((x) => x + 1)}
        key={refreshKey}
      />
    </div>
  );
}
