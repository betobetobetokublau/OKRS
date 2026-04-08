'use client';

import { useParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { useWorkspace } from '@/hooks/use-workspace';
import { useRealtime } from '@/hooks/use-realtime';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const workspaceSlug = params['workspace-slug'] as string;
  const { currentWorkspace, userWorkspace, profile } = useWorkspace(workspaceSlug);

  useRealtime(profile?.id);

  if (!currentWorkspace || !userWorkspace || !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="Polaris-Spinner" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #dfe3e8',
              borderTopColor: '#5c6ac4',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ color: '#637381', fontSize: '1.4rem' }}>Cargando workspace...</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        workspaceSlug={workspaceSlug}
        role={userWorkspace.role}
        workspaceName={currentWorkspace.name}
      />
      <div style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column' }}>
        <Topbar
          profile={profile}
          userId={profile.id}
          workspaceId={currentWorkspace.id}
        />
        <main style={{ flex: 1, padding: '2.4rem' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
