'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { UserAvatar } from '@/components/common/user-avatar';
import { writeImpersonationTarget } from '@/lib/impersonation';
import type { Profile, UserWorkspace, WorkspaceRole, Department, UserDepartment } from '@/types';

interface TeamMember {
  profile: Profile;
  userWorkspace: UserWorkspace;
  departments: Department[];
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default function EquipoPage() {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = (params['workspace-slug'] as string) || '';
  const {
    currentWorkspace,
    userWorkspace,
    profile: currentProfile,
    enterImpersonation,
  } = useWorkspaceStore();
  // Only real admins can impersonate. Note: if the current admin is ALREADY
  // impersonating, userWorkspace.role reflects the impersonated role, so
  // `isImpersonating` is true and we hide the button in that case to avoid
  // nested impersonation.
  const { isImpersonating } = useWorkspaceStore();
  const canImpersonate =
    !isImpersonating && userWorkspace?.role === 'admin';
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Create-user modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: '',
    email: '',
    role: 'member' as WorkspaceRole,
    department_ids: [] as string[],
    password: '',
    must_change_password: true,
  });
  const [creating, setCreating] = useState(false);
  const [tempPasswordShown, setTempPasswordShown] = useState('');
  const [createError, setCreateError] = useState('');

  // Password-reset modal for existing users
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [resetForm, setResetForm] = useState({ password: '', must_change_password: true });
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (currentWorkspace?.id) loadTeam();
  }, [currentWorkspace?.id]);

  async function loadTeam() {
    const supabase = createClient();
    const [membersRes, deptsRes] = await Promise.all([
      supabase.from('user_workspaces').select('*, profile:profiles(*)').eq('workspace_id', currentWorkspace!.id),
      supabase.from('departments').select('*').eq('workspace_id', currentWorkspace!.id),
    ]);

    const memberData = (membersRes.data || []) as (UserWorkspace & { profile: Profile })[];
    const depts = (deptsRes.data || []) as Department[];
    setDepartments(depts);

    // Load department assignments in a single query instead of N per member.
    const userIds = memberData.map((m) => m.user_id);
    const { data: udData } = userIds.length > 0
      ? await supabase
          .from('user_departments')
          .select('*, department:departments(*)')
          .in('user_id', userIds)
      : { data: [] };

    const deptsByUser = new Map<string, Department[]>();
    ((udData || []) as Array<UserDepartment & { department: Department }>).forEach((ud) => {
      if (!ud.department) return;
      const arr = deptsByUser.get(ud.user_id) || [];
      arr.push(ud.department);
      deptsByUser.set(ud.user_id, arr);
    });

    setMembers(
      memberData.map((m) => ({
        profile: m.profile,
        userWorkspace: m,
        departments: deptsByUser.get(m.user_id) || [],
      })),
    );
    setLoading(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    const password = newUser.password.trim() || generateTempPassword();

    const res = await fetch('/api/auth/crear-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newUser.email,
        full_name: newUser.full_name,
        password,
        role: newUser.role,
        workspace_id: currentWorkspace!.id,
        department_ids: newUser.department_ids,
        must_change_password: newUser.must_change_password,
      }),
    });

    if (res.ok) {
      setTempPasswordShown(password);
      await loadTeam();
    } else {
      const body = await res.json().catch(() => ({}));
      setCreateError(body.error || 'No se pudo crear el usuario');
    }
    setCreating(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    setResetError('');

    const res = await fetch('/api/auth/cambiar-password-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_id: resetTarget.profile.id,
        workspace_id: currentWorkspace!.id,
        password: resetForm.password,
        must_change_password: resetForm.must_change_password,
      }),
    });
    if (res.ok) {
      setResetDone(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setResetError(body.error || 'No se pudo cambiar la contraseña');
    }
    setResetting(false);
  }

  /**
   * Enter "view as user" mode. We persist the target id to sessionStorage
   * (so refreshes preserve the impersonation) and apply the swap to the
   * workspace store synchronously so the current tab updates without a
   * round-trip. Then we route to a role-appropriate landing page:
   *   - member : /check-in (they can't see the analytics dashboard).
   *   - manager: /objetivos (their operational focus).
   *   - admin  : / (dashboard, same as their own login).
   *
   * The workspace root (/) is the analytics dashboard — it'd feel broken
   * for a member to land there, especially since their sidebar no longer
   * shows it. Route by role instead.
   */
  function handleImpersonate(member: TeamMember) {
    if (!canImpersonate) return;
    if (!currentProfile || !userWorkspace) return;
    if (member.profile.id === currentProfile.id) return;

    writeImpersonationTarget(member.profile.id);
    enterImpersonation(
      { profile: currentProfile, userWorkspace },
      { profile: member.profile, userWorkspace: member.userWorkspace },
    );

    const targetRole = member.userWorkspace.role;
    const landing =
      targetRole === 'member'
        ? `/${workspaceSlug}/check-in`
        : targetRole === 'manager'
          ? `/${workspaceSlug}/objetivos`
          : `/${workspaceSlug}`;
    router.push(landing);
  }

  /**
   * Change a member's role. Routes through `/api/auth/cambiar-rol-usuario`
   * because `user_workspaces` RLS doesn't expose an UPDATE path to the
   * authenticated role — the server handler validates the caller is an
   * admin of this workspace and uses the service-role client to persist.
   *
   * Optimistic echo: we update the table immediately, then revert + show
   * an alert if the server rejects the change.
   */
  async function handleRoleChange(targetUserId: string, uwId: string, newRole: WorkspaceRole) {
    if (!currentWorkspace) return;

    // Snapshot the previous role so we can roll back on failure.
    const prevRole = members.find((m) => m.userWorkspace.id === uwId)?.userWorkspace.role ?? null;

    setMembers((prev) =>
      prev.map((m) =>
        m.userWorkspace.id === uwId
          ? { ...m, userWorkspace: { ...m.userWorkspace, role: newRole } }
          : m,
      ),
    );

    const res = await fetch('/api/auth/cambiar-rol-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_id: targetUserId,
        workspace_id: currentWorkspace.id,
        role: newRole,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error || 'No se pudo cambiar el rol.';
      if (prevRole) {
        setMembers((prev) =>
          prev.map((m) =>
            m.userWorkspace.id === uwId
              ? { ...m, userWorkspace: { ...m.userWorkspace, role: prevRole } }
              : m,
          ),
        );
      }
      // A lightweight alert avoids inventing a toast system here; the
      // more serious error surface (last-admin block, forbidden) lands
      // here with a clear Spanish message from the server.
      alert(msg);
    }
  }

  const cellStyle: React.CSSProperties = { padding: '1.2rem 1.6rem' };
  const headStyle: React.CSSProperties = {
    padding: '1.2rem 1.6rem',
    textAlign: 'left',
    fontWeight: 600,
    color: '#637381',
    fontSize: '1.2rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.4rem' }}>
        <div>
          <h1 className="Polaris-Heading" style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36' }}>Equipo</h1>
          <p style={{ color: '#637381', fontSize: '1.4rem', marginTop: '0.4rem' }}>
            Gestiona los usuarios del workspace
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreateModal(true);
            setTempPasswordShown('');
            setCreateError('');
            setNewUser({
              full_name: '',
              email: '',
              role: 'member',
              department_ids: [],
              password: '',
              must_change_password: true,
            });
          }}
          className="Polaris-Button Polaris-Button--primary"
          style={{
            padding: '0.8rem 1.6rem',
            fontSize: '1.4rem',
            fontWeight: 600,
            color: 'white',
            backgroundColor: '#5c6ac4',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + Crear usuario
        </button>
      </div>

      {/* Team list */}
      <div className="Polaris-Card" style={{ borderRadius: '8px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1.4rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb' }}>
              <th style={headStyle}>Usuario</th>
              <th style={headStyle}>Email</th>
              <th style={headStyle}>Rol</th>
              <th style={headStyle}>Departamentos</th>
              <th style={headStyle}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#637381' }}>Cargando...</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#637381' }}>No hay usuarios en este workspace</td></tr>
            ) : members.map((m) => (
              <tr key={m.profile.id} style={{ borderTop: '1px solid #f4f6f8' }}>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <UserAvatar user={m.profile} size="small" />
                    <span style={{ fontWeight: 500, color: '#212b36' }}>{m.profile.full_name}</span>
                    {m.profile.must_change_password && (
                      <span style={{ fontSize: '1.1rem', color: '#8a6116', backgroundColor: '#fcf1cd', padding: '2px 8px', borderRadius: '10rem' }}>
                        Debe cambiar contraseña
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ ...cellStyle, color: '#637381' }}>{m.profile.email}</td>
                <td style={cellStyle}>
                  <select
                    value={m.userWorkspace.role}
                    onChange={(e) => handleRoleChange(m.profile.id, m.userWorkspace.id, e.target.value as WorkspaceRole)}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '1.3rem', border: '1px solid #c4cdd5', borderRadius: '4px', backgroundColor: 'white' }}
                  >
                    <option value="admin">Administrador</option>
                    <option value="manager">Manager</option>
                    <option value="member">Miembro</option>
                  </select>
                </td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {m.departments.map((d) => (
                      <span key={d.id} style={{ padding: '2px 8px', borderRadius: '3px', fontSize: '1.2rem', backgroundColor: d.color + '20', color: d.color }}>
                        {d.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                    {canImpersonate && m.profile.id !== currentProfile?.id && (
                      <button
                        type="button"
                        onClick={() => handleImpersonate(m)}
                        title={`Ver la plataforma como ${m.profile.full_name}`}
                        style={{
                          padding: '0.4rem 1rem',
                          fontSize: '1.2rem',
                          color: '#212b36',
                          backgroundColor: '#f4f6f8',
                          border: '1px solid #dfe3e8',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Entrar como
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setResetTarget(m);
                        setResetForm({ password: '', must_change_password: true });
                        setResetDone(false);
                        setResetError('');
                      }}
                      style={{
                        padding: '0.4rem 1rem',
                        fontSize: '1.2rem',
                        color: '#5c6ac4',
                        backgroundColor: 'transparent',
                        border: '1px solid #dfe3e8',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Cambiar contraseña
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create user modal */}
      {showCreateModal && (
        <div className="anim-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="Polaris-Card anim-modal-card" style={{ width: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '2.4rem', borderRadius: '12px' }}>
            {tempPasswordShown ? (
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Usuario creado</h2>
                <div style={{ padding: '1.6rem', backgroundColor: '#e3f1df', borderRadius: '8px', marginBottom: '1.6rem' }}>
                  <p style={{ fontSize: '1.3rem', color: '#108043', marginBottom: '0.8rem' }}>Comparte estas credenciales con el usuario:</p>
                  <p style={{ fontSize: '1.4rem', color: '#212b36' }}><strong>Email:</strong> {newUser.email}</p>
                  <p style={{ fontSize: '1.4rem', color: '#212b36' }}><strong>Contraseña:</strong> {tempPasswordShown}</p>
                  <p style={{ fontSize: '1.2rem', color: '#637381', marginTop: '0.8rem' }}>
                    {newUser.must_change_password ? 'El usuario deberá cambiar la contraseña en su primer inicio de sesión.' : 'El usuario podrá usar esta contraseña directamente.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ width: '100%', padding: '0.8rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateUser}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>Crear usuario</h2>
                  <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Nombre completo</label>
                    <input value={newUser.full_name} onChange={(e) => setNewUser((p) => ({ ...p, full_name: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Correo electrónico</label>
                    <input type="email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Rol</label>
                    <select value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as WorkspaceRole }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                      <option value="member">Miembro</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Contraseña</label>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <input
                        type="text"
                        value={newUser.password}
                        onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Dejar vacío para generar automáticamente"
                        style={{ flex: 1, padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setNewUser((p) => ({ ...p, password: generateTempPassword() }))}
                        style={{ padding: '0 1.2rem', fontSize: '1.2rem', color: '#5c6ac4', backgroundColor: '#f4f5fc', border: '1px solid #e3e5f1', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Generar
                      </button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.3rem', marginTop: '0.8rem', cursor: 'pointer', color: '#454f5b' }}>
                      <input
                        type="checkbox"
                        checked={newUser.must_change_password}
                        onChange={(e) => setNewUser((p) => ({ ...p, must_change_password: e.target.checked }))}
                      />
                      Requerir cambio de contraseña en el próximo inicio de sesión
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Departamentos</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                      {departments.map((d) => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.3rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={newUser.department_ids.includes(d.id)}
                            onChange={(e) => {
                              setNewUser((p) => ({
                                ...p,
                                department_ids: e.target.checked
                                  ? [...p.department_ids, d.id]
                                  : p.department_ids.filter((id) => id !== d.id),
                              }));
                            }}
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  {createError && (
                    <p style={{ color: '#bf0711', fontSize: '1.3rem' }}>{createError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={creating}
                    style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: creating ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: creating ? 'not-allowed' : 'pointer' }}
                  >
                    {creating ? 'Creando...' : 'Crear usuario'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Password reset modal */}
      {resetTarget && (
        <div className="anim-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="Polaris-Card anim-modal-card" style={{ width: '440px', padding: '2.4rem', borderRadius: '12px' }}>
            {resetDone ? (
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Contraseña actualizada</h2>
                <div style={{ padding: '1.6rem', backgroundColor: '#e3f1df', borderRadius: '8px', marginBottom: '1.6rem' }}>
                  <p style={{ fontSize: '1.3rem', color: '#108043', marginBottom: '0.8rem' }}>
                    Comparte la nueva contraseña con {resetTarget.profile.full_name}:
                  </p>
                  <p style={{ fontSize: '1.4rem', color: '#212b36' }}><strong>{resetForm.password}</strong></p>
                </div>
                <button
                  onClick={() => setResetTarget(null)}
                  style={{ width: '100%', padding: '0.8rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36' }}>Cambiar contraseña</h2>
                  <button type="button" onClick={() => setResetTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '2rem', color: '#637381' }}>&times;</button>
                </div>
                <p style={{ color: '#637381', fontSize: '1.3rem', marginBottom: '1.6rem' }}>
                  Para <strong>{resetTarget.profile.full_name}</strong> ({resetTarget.profile.email})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Nueva contraseña</label>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <input
                        type="text"
                        value={resetForm.password}
                        onChange={(e) => setResetForm((p) => ({ ...p, password: e.target.value }))}
                        required
                        minLength={6}
                        style={{ flex: 1, padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setResetForm((p) => ({ ...p, password: generateTempPassword() }))}
                        style={{ padding: '0 1.2rem', fontSize: '1.2rem', color: '#5c6ac4', backgroundColor: '#f4f5fc', border: '1px solid #e3e5f1', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Generar
                      </button>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.3rem', cursor: 'pointer', color: '#454f5b' }}>
                    <input
                      type="checkbox"
                      checked={resetForm.must_change_password}
                      onChange={(e) => setResetForm((p) => ({ ...p, must_change_password: e.target.checked }))}
                    />
                    Requerir cambio de contraseña en el próximo inicio de sesión
                  </label>
                  {resetError && <p style={{ color: '#bf0711', fontSize: '1.3rem' }}>{resetError}</p>}
                  <button
                    type="submit"
                    disabled={resetting}
                    style={{ width: '100%', padding: '1rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: resetting ? '#8c92c4' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: resetting ? 'not-allowed' : 'pointer' }}
                  >
                    {resetting ? 'Actualizando...' : 'Actualizar contraseña'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
