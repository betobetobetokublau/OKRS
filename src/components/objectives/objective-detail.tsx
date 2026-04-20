'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canManageContent } from '@/lib/utils/permissions';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { ObjectiveDetailPanelBody } from '@/components/okrs/objective-detail-panel-body';
import type { Department } from '@/types';

interface ObjectiveDetailProps {
  objectiveId: string;
}

/**
 * Full-page view for `/{workspace}/objetivos/[id]`. Delegates to the shared
 * Asana-style shell so slide-in panel and full page stay in sync.
 */
export function ObjectiveDetail({ objectiveId }: ObjectiveDetailProps) {
  const { userWorkspace, currentWorkspace } = useWorkspaceStore();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      if (!currentWorkspace?.id) return;
      const supabase = createClient();
      const { data } = await supabase
        .from('departments')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('name', { ascending: true });
      if (data) setDepartments(data as Department[]);
    }
    load();
  }, [currentWorkspace?.id]);

  const canEdit = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <ObjectiveDetailPanelBody
        objectiveId={objectiveId}
        departments={departments}
        canEdit={canEdit}
        onChanged={() => setRefreshKey((x) => x + 1)}
        key={refreshKey}
      />
    </div>
  );
}
