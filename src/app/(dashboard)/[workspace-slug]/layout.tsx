'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Sidebar, SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import {
  OnboardingCarousel,
  readLocalOnboarded,
} from '@/components/onboarding/onboarding-carousel';
import { useWorkspace } from '@/hooks/use-workspace';
import { useRealtime } from '@/hooks/use-realtime';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useWorkspaceStore } from '@/stores/workspace-store';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const workspaceSlug = params['workspace-slug'] as string;
  const { currentWorkspace, userWorkspace, profile } = useWorkspace(workspaceSlug);
  const collapsed = useSidebarStore((s) => s.collapsed);
  const isImpersonating = useWorkspaceStore((s) => s.isImpersonating);

  // Local override so the carousel disappears immediately on completion
  // without waiting for the profile re-fetch to return `onboarded_at`.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

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

  // Main content is offset by the COLLAPSED-OR-EXPANDED width (the persisted
  // state). The sidebar's hover expansion overlays on top without nudging the
  // main content.
  const mainOffset = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  // Show the first-login carousel for members + managers who've never
  // completed it. Admins skip entirely (they're the ones provisioning
  // everyone else, so they don't need the intro). And suppress it while
  // impersonating — otherwise an admin stepping into a freshly-created
  // member's shoes would hit the carousel every time.
  //
  // The "already completed" test checks BOTH the DB column AND a local
  // flag. The local flag covers the case where the onboarded_at
  // migration hasn't been applied yet, or the POST to completar failed:
  // either way, once the user has clicked through once we don't want
  // to replay the carousel on every reload.
  const alreadyOnboardedDb = profile.onboarded_at != null;
  const alreadyOnboardedLocal = readLocalOnboarded(profile.id);
  const shouldShowOnboarding =
    !isImpersonating &&
    !onboardingDismissed &&
    !alreadyOnboardedDb &&
    !alreadyOnboardedLocal &&
    userWorkspace.role !== 'admin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar
        profile={profile}
        userId={profile.id}
        workspaceId={currentWorkspace.id}
        workspaceName={currentWorkspace.name}
      />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar
          workspaceSlug={workspaceSlug}
          role={userWorkspace.role}
          workspaceName={currentWorkspace.name}
        />
        <main
          style={{
            flex: 1,
            marginLeft: `${mainOffset}px`,
            padding: '2.4rem',
            transition: 'margin-left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          {children}
        </main>
      </div>
      {shouldShowOnboarding && (
        <OnboardingCarousel
          role={userWorkspace.role}
          userId={profile.id}
          onDone={() => setOnboardingDismissed(true)}
        />
      )}
    </div>
  );
}
