'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useOfflineStore } from '@/stores/offline-store';
import { UserAvatar } from '@/components/common/user-avatar';
import { promptInstall } from '@/lib/pwa/install-prompt';
import { signOutEverywhere } from '@/lib/auth/logout';
import { getRoleLabel, hasMinRole } from '@/lib/utils/permissions';

interface Row {
  label: string;
  href: string;
  hint?: string;
}

/**
 * Phone «Más» screen (design B1): profile header, the read-only Listados, and
 * Administración for admins. On desktop the same links live in the sidebar,
 * so this route simply mirrors them.
 */
export default function MasPage() {
  const params = useParams<{ 'workspace-slug': string }>();
  const slug = params?.['workspace-slug'] ?? '';
  const router = useRouter();
  const { profile, userWorkspace, currentWorkspace } = useWorkspaceStore();
  const installable = useOfflineStore((s) => s.installable);
  const base = `/${slug}`;
  const role = userWorkspace?.role ?? 'member';

  const listados: Row[] = [
    { label: 'Resumen', href: base, hint: 'Dashboard del trimestre' },
    { label: 'Trimestral', href: `${base}/trimestral`, hint: 'Resumen por departamento y KPIs' },
    { label: 'Revisión mensual', href: `${base}/revision-mensual` },
    { label: 'Departamentos', href: `${base}/departamentos` },
  ];
  const admin: Row[] = [
    { label: 'Equipo', href: `${base}/equipo`, hint: 'Solo lectura en el teléfono' },
    { label: 'Periodos', href: `${base}/periodos`, hint: 'Solo lectura en el teléfono' },
    { label: 'Configuración', href: `${base}/configuracion` },
  ];

  async function handleLogout() {
    await signOutEverywhere();
    router.push('/login');
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
      {profile && (
        <section style={{ backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', padding: '1.6rem', display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <UserAvatar user={profile} size="large" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 600, color: '#212b36', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.full_name}</div>
            <div style={{ fontSize: '1.3rem', color: '#637381' }}>
              {getRoleLabel(role)}
              {currentWorkspace ? ` · ${currentWorkspace.name}` : ''}
            </div>
          </div>
        </section>
      )}

      <Group title="Listados" rows={listados} />
      {hasMinRole(role, 'manager') && <Group title="Administración" rows={admin} />}

      <section style={{ backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', overflow: 'hidden' }}>
        {installable && (
          <button type="button" onClick={() => promptInstall()} style={ROW_BTN}>
            Instalar la app en este teléfono
          </button>
        )}
        <button type="button" onClick={handleLogout} style={{ ...ROW_BTN, color: '#de3618' }}>
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}

const ROW_BTN = { width: '100%', textAlign: 'left', padding: '1.4rem 1.6rem', border: 'none', borderTop: '1px solid #f1f2f4', background: 'white', fontSize: '1.4rem', fontWeight: 500, color: '#212b36', cursor: 'pointer' } as const;

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section aria-label={title}>
      <h2 style={{ margin: '0 0 0.6rem 0.4rem', fontSize: '1.1rem', fontWeight: 700, color: '#919eab', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h2>
      <div style={{ backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <Link
            key={r.href + r.label}
            href={r.href}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.3rem 1.6rem', textDecoration: 'none', color: '#212b36', borderTop: i === 0 ? 'none' : '1px solid #f1f2f4' }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500 }}>{r.label}</span>
              {r.hint && <span style={{ display: 'block', fontSize: '1.2rem', color: '#919eab' }}>{r.hint}</span>}
            </span>
            <span aria-hidden style={{ color: '#c4cdd5', fontSize: '1.8rem' }}>›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
