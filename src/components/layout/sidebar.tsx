'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { WorkspaceRole } from '@/types';
import { canManageTeam } from '@/lib/utils/permissions';

interface SidebarProps {
  workspaceSlug: string;
  role: WorkspaceRole;
  workspaceName: string;
  pendingReview?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: boolean;
  adminOnly?: boolean;
  managerOnly?: boolean;
}

export function Sidebar({ workspaceSlug, role, pendingReview }: SidebarProps) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}`;

  const navItems: NavItem[] = [
    { label: 'Dashboard', href: base, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
    { label: 'OKRs', href: `${base}/okrs`, icon: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
    { label: 'Objetivos', href: `${base}/objetivos`, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'KPIs', href: `${base}/kpis`, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { label: 'Mis Tareas', href: `${base}/mis-tareas`, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { label: 'Revisión Mensual', href: `${base}/revision-mensual`, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', badge: pendingReview },
    { label: 'Trimestral', href: `${base}/trimestral`, icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
    { label: 'Departamentos', href: `${base}/departamentos`, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  ];

  const adminItems: NavItem[] = [
    { label: 'Equipo', href: `${base}/equipo`, icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', adminOnly: true },
    { label: 'Periodos', href: `${base}/periodos`, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', adminOnly: true },
    { label: 'Configuración', href: `${base}/configuracion`, icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', adminOnly: true },
  ];

  function isActive(href: string): boolean {
    if (href === base) return pathname === base;
    return pathname.startsWith(href);
  }

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '1.2rem',
    padding: '0.4rem 1.2rem',
    margin: '0 0.8rem',
    borderRadius: '3px',
    color: active ? '#202e78' : '#212b36',
    backgroundColor: active ? 'rgba(92, 106, 196, 0.12)' : 'transparent',
    textDecoration: 'none',
    fontSize: '1.4rem',
    fontWeight: active ? 600 : 500,
    lineHeight: '2.4rem',
    transition: 'background 0.15s ease',
    marginBottom: '1px',
  });

  const iconColor = (active: boolean): string => active ? '#5c6ac4' : '#919eab';

  return (
    <nav
      className="Polaris-Navigation"
      style={{
        width: '240px',
        backgroundColor: '#f4f6f8',
        borderRight: '1px solid #dfe3e8',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: '56px',
        bottom: 0,
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      {/* Main nav */}
      <div style={{ padding: '1.2rem 0', flex: 1 }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} style={linkStyle(active)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor(active)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#de3618',
                      }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Admin section */}
        {canManageTeam(role) && (
          <>
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#637381',
                padding: '1.6rem 2rem 0.4rem',
                marginTop: '0.8rem',
              }}
            >
              Administración
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {adminItems.map((item) => {
                if (item.adminOnly && !canManageTeam(role)) return null;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href} style={linkStyle(active)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={iconColor(active)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.icon} />
                      </svg>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </nav>
  );
}
