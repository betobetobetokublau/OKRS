'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from './notification-bell';
import { UserAvatar } from '@/components/common/user-avatar';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { writeImpersonationTarget } from '@/lib/impersonation';
import type { Profile } from '@/types';
import { useState, useRef, useEffect } from 'react';

interface TopbarProps {
  profile: Profile | null;
  userId: string;
  workspaceId: string;
  workspaceName?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function Topbar({ profile, userId, workspaceId, workspaceName, breadcrumbs }: TopbarProps) {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = (params['workspace-slug'] as string) || '';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const isImpersonating = useWorkspaceStore((s) => s.isImpersonating);
  const exitImpersonation = useWorkspaceStore((s) => s.exitImpersonation);

  // In impersonation mode the whole topbar flips to a near-black fill so
  // admins always know at a glance they're not looking at their own view.
  // The translucent pills (Check-in CTA, Volver-al-admin, avatar menu)
  // read fine against either palette.
  const topbarBg = isImpersonating ? '#1a1a1a' : 'var(--color-topbar)';

  function handleExitImpersonation() {
    writeImpersonationTarget(null);
    exitImpersonation();
    // Route back to the team/users page where the admin launched from.
    router.push(`/${workspaceSlug}/equipo`);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header
      className="Polaris-TopBar"
      style={{
        height: '56px',
        backgroundColor: topbarBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2.4rem',
        position: 'sticky',
        top: 0,
        zIndex: 150,
        width: '100%',
        transition: 'background-color 140ms ease',
      }}
    >
      {/* Left: Hamburger + Logo + workspace name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Alternar barra lateral"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderRadius: '4px',
            color: 'white',
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ color: 'white', fontWeight: 700, fontSize: '1.6rem', letterSpacing: '-0.02em' }}>
          {workspaceName || 'kublau'}
        </span>

        {/* Exit-impersonation pill. Only shown while an admin is viewing
            as another user. Sits right next to the workspace name so the
            escape hatch is always one click away. */}
        {isImpersonating && (
          <button
            type="button"
            onClick={handleExitImpersonation}
            title="Volver a tu vista de administrador"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginLeft: '0.8rem',
              padding: '0.5rem 1.1rem',
              borderRadius: '999px',
              background: '#ffe082',
              color: '#1a1a1a',
              border: '1px solid #f5c542',
              fontSize: '1.25rem',
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: 1,
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Volver al admin
          </button>
        )}

        {/* Breadcrumbs (only when explicitly passed) */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '1.2rem' }}>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {i > 0 && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.3rem' }}>/</span>}
                {crumb.href ? (
                  <a href={crumb.href} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '1.3rem' }}>
                    {crumb.label}
                  </a>
                ) : (
                  <span style={{ color: 'white', fontSize: '1.3rem', fontWeight: 500 }}>
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Center: Check-in CTA (absolutely centered so left/right zones
          stay anchored). Flanked by a target icon on the left and an
          arrow on the right so the affordance reads as both "a goal"
          and "go somewhere." Label size bumped ~20% from 1.3 → 1.56rem
          per the design note. */}
      {workspaceSlug && (
        <Link
          href={`/${workspaceSlug}/check-in`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.7rem',
            padding: '0.7rem 1.6rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: 'white',
            fontSize: '1.56rem',
            fontWeight: 500,
            textDecoration: 'none',
            lineHeight: 1,
            transition: 'background 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.22)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
          }}
        >
          {/* Bullseye — signals "goal" / OKR */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.5" />
          </svg>
          Check-in
          {/* Right arrow — signals "go to the check-in flow" */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Right: Help + Notifications + User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem' }}>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.3rem', cursor: 'pointer' }}>
          Ayuda
        </span>

        <NotificationBell userId={userId} workspaceId={workspaceId} />

        {/* User menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px',
            }}
          >
            {profile && <UserAvatar user={profile} size="small" />}
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1.3rem', color: 'white', fontWeight: 500, lineHeight: '1.4' }}>
                {profile?.full_name || ''}
              </div>
              <div style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.2' }}>
                {profile?.email || ''}
              </div>
            </div>
          </button>

          {menuOpen && (
            <div
              className="Polaris-Card"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                width: '200px',
                zIndex: 200,
                borderRadius: '8px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                marginTop: '4px',
                padding: '0.4rem',
              }}
            >
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '0.8rem 1.2rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '1.3rem',
                  color: '#de3618',
                  textAlign: 'left',
                  borderRadius: '4px',
                }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
