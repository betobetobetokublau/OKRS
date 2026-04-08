'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NotificationBell } from './notification-bell';
import { UserAvatar } from '@/components/common/user-avatar';
import type { Profile } from '@/types';
import { useState, useRef, useEffect } from 'react';

interface TopbarProps {
  profile: Profile | null;
  userId: string;
  workspaceId: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function Topbar({ profile, userId, workspaceId, breadcrumbs }: TopbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2.4rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {breadcrumbs?.map((crumb, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {i > 0 && <span style={{ color: '#919eab', fontSize: '1.3rem' }}>/</span>}
            {crumb.href ? (
              <a
                href={crumb.href}
                style={{ color: '#637381', textDecoration: 'none', fontSize: '1.3rem' }}
              >
                {crumb.label}
              </a>
            ) : (
              <span style={{ color: '#212b36', fontSize: '1.3rem', fontWeight: 500 }}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
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
            <span style={{ fontSize: '1.3rem', color: '#212b36', fontWeight: 500 }}>
              {profile?.full_name || ''}
            </span>
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
