'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Sidebar, SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import {
  OnboardingCarousel,
  readLocalOnboarded,
} from '@/components/onboarding/onboarding-carousel';
import { useWorkspace } from '@/hooks/use-workspace';
import { useRealtime } from '@/hooks/use-realtime';
import { useOfflineSync } from '@/lib/offline/sync';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useBoards } from '@/hooks/use-boards';
import { useWarmRoutes } from '@/lib/pwa/warm-routes';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useCheckinPending } from '@/hooks/use-checkin-pending';
import { MobileTabBar, MOBILE_TAB_BAR_HEIGHT } from '@/components/mobile/mobile-tab-bar';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const workspaceSlug = params['workspace-slug'] as string;
  const { currentWorkspace, userWorkspace, profile } = useWorkspace(workspaceSlug);
  const collapsed = useSidebarStore((s) => s.collapsed);
  const isImpersonating = useWorkspaceStore((s) => s.isImpersonating);
  // Phone shell (design B1): no sidebar, bottom tab bar, tighter padding.
  const { isMobile } = useIsMobile();
  const { pending: checkinPending } = useCheckinPending(currentWorkspace?.id, profile?.id);

  // Local override so the carousel disappears immediately on completion
  // without waiting for the profile re-fetch to return `onboarded_at`.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useRealtime(profile?.id);

  // PWA: pre-cache the daily routes (+ every visible board) so they open
  // offline even if this session never visited them. Re-runs on reconnect.
  const { boards } = useBoards(currentWorkspace?.id);
  useWarmRoutes(currentWorkspace?.slug, boards.map((b) => b.id));
  // Replays writes queued while offline (see src/lib/offline).
  useOfflineSync();

  // Offline safety: if the bootstrap queries never resolve (no cached copy of
  // this workspace's data), don't spin forever — explain and offer the hub.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const booting = !currentWorkspace || !userWorkspace || !profile;
  useEffect(() => {
    if (!booting) {
      setBootTimedOut(false);
      return;
    }
    const t = setTimeout(() => setBootTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [booting]);

  if (booting && bootTimedOut) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2.4rem' }}>
        <div style={{ maxWidth: '46rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', margin: '0 0 0.8rem' }}>
            No pudimos cargar el workspace
          </p>
          <p style={{ color: '#637381', fontSize: '1.4rem', lineHeight: 1.6, margin: '0 0 2rem' }}>
            {typeof navigator !== 'undefined' && !navigator.onLine
              ? 'Estás sin conexión y esta parte aún no está guardada en tu dispositivo.'
              : 'La conexión está tardando más de lo normal.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: '1rem 1.8rem', fontSize: '1.4rem', fontWeight: 600, color: '#fff', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              Reintentar
            </button>
            <a href="/offline.html" style={{ padding: '1rem 1.8rem', fontSize: '1.4rem', fontWeight: 600, color: '#212b36', backgroundColor: '#fff', border: '1px solid #c4cdd5', borderRadius: '8px', textDecoration: 'none' }}>
              Ver páginas disponibles sin conexión
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (booting) {
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
  const mainOffset = isMobile ? 0 : collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

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
        {!isMobile && (
          <Sidebar
            workspaceSlug={workspaceSlug}
            role={userWorkspace.role}
            workspaceName={currentWorkspace.name}
          />
        )}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            marginLeft: `${mainOffset}px`,
            padding: isMobile ? '1.6rem 1.6rem 0' : '2.4rem',
            // Room for the fixed tab bar (+ the device's home indicator).
            paddingBottom: isMobile ? `calc(${MOBILE_TAB_BAR_HEIGHT}px + 2rem + env(safe-area-inset-bottom, 0px))` : undefined,
            transition: 'margin-left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          {children}
        </main>
      </div>
      {isMobile && <MobileTabBar slug={workspaceSlug} checkinPending={checkinPending === true} />}
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
