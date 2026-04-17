'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from './notification-bell';
import { UserAvatar } from '@/components/common/user-avatar';
import { useSidebarStore } from '@/stores/sidebar-store';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

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
        backgroundColor: 'var(--color-topbar)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2.4rem',
        position: 'sticky',
        top: 0,
        zIndex: 150,
        width: '100%',
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

        {/* Breadcrumbs */}
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
