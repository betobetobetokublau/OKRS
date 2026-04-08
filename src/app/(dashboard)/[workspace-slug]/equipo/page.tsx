'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { UserAvatar } from '@/components/common/user-avatar';
import type { Profile, UserWorkspace, WorkspaceRole, Department, UserDepartment } from '@/types';

interface TeamMember {
  profile: Profile;
  userWorkspace: UserWorkspace;
  departments: Department[];
}

export default function EquipoPage() {
  const { currentWorkspace } = useWorkspaceStore();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', role: 'member' as WorkspaceRole, department_ids: [] as string[] });
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

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

    // Load department assignments for each member
    const teamMembers: TeamMember[] = [];
    for (const m of memberData) {
      const { data: udData } = await supabase
        .from('user_departments')
        .select('*, department:departments(*)')
        .eq('user_id', m.user_id);
      teamMembers.push({
        profile: m.profile,
        userWorkspace: m,
        departments: (udData || []).map((ud: UserDepartment & { department: Department }) => ud.department),
      });
    }

    setMembers(teamMembers);
    setLoading(false);
  }

  function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const password = generateTempPassword();

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
      }),
    });

    if (res.ok) {
      setTempPassword(password);
      await loadTeam();
    }
    setCreating(false);
  }

  async function handleRoleChange(userId: string, uwId: string, newRole: WorkspaceRole) {
    const supabase = createClient();
    await supabase.from('user_workspaces').update({ role: newRole }).eq('id', uwId);
    setMembers(prev =>
      prev.map(m =>
        m.userWorkspace.id === uwId
          ? { ...m, userWorkspace: { ...m.userWorkspace, role: newRole } }
          : m
      )
    );
  }

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
          onClick={() => { setShowCreateModal(true); setTempPassword(''); setNewUser({ full_name: '', email: '', role: 'member', department_ids: [] }); }}
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
              <th style={{ padding: '1.2rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuario</th>
              <th style={{ padding: '1.2rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>
              <th style={{ padding: '1.2rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rol</th>
              <th style={{ padding: '1.2rem 1.6rem', textAlign: 'left', fontWeight: 600, color: '#637381', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Departamentos</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#637381' }}>Cargando...</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#637381' }}>No hay usuarios en este workspace</td></tr>
            ) : members.map((m) => (
              <tr key={m.profile.id} style={{ borderTop: '1px solid #f4f6f8' }}>
                <td style={{ padding: '1.2rem 1.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <UserAvatar user={m.profile} size="small" />
                    <span style={{ fontWeight: 500, color: '#212b36' }}>{m.profile.full_name}</span>
                  </div>
                </td>
                <td style={{ padding: '1.2rem 1.6rem', color: '#637381' }}>{m.profile.email}</td>
                <td style={{ padding: '1.2rem 1.6rem' }}>
                  <select
                    value={m.userWorkspace.role}
                    onChange={(e) => handleRoleChange(m.profile.id, m.userWorkspace.id, e.target.value as WorkspaceRole)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      fontSize: '1.3rem',
                      border: '1px solid #c4cdd5',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                    }}
                  >
                    <option value="admin">Administrador</option>
                    <option value="manager">Manager</option>
                    <option value="member">Miembro</option>
                  </select>
                </td>
                <td style={{ padding: '1.2rem 1.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {m.departments.map(d => (
                      <span key={d.id} style={{ padding: '2px 8px', borderRadius: '3px', fontSize: '1.2rem', backgroundColor: d.color + '20', color: d.color }}>
                        {d.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create user modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="Polaris-Card" style={{ width: '480px', padding: '2.4rem', borderRadius: '12px' }}>
            {tempPassword ? (
              <div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>Usuario creado</h2>
                <div style={{ padding: '1.6rem', backgroundColor: '#e3f1df', borderRadius: '8px', marginBottom: '1.6rem' }}>
                  <p style={{ fontSize: '1.3rem', color: '#108043', marginBottom: '0.8rem' }}>Comparte estas credenciales con el usuario:</p>
                  <p style={{ fontSize: '1.4rem', color: '#212b36' }}><strong>Email:</strong> {newUser.email}</p>
                  <p style={{ fontSize: '1.4rem', color: '#212b36' }}><strong>Contraseña temporal:</strong> {tempPassword}</p>
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
                    <input value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Correo electrónico</label>
                    <input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} required style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Rol</label>
                    <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value as WorkspaceRole }))} style={{ width: '100%', padding: '0.8rem 1.2rem', fontSize: '1.4rem', border: '1px solid #c4cdd5', borderRadius: '4px' }}>
                      <option value="member">Miembro</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '1.4rem', fontWeight: 500, marginBottom: '0.4rem' }}>Departamentos</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                      {departments.map(d => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.3rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={newUser.department_ids.includes(d.id)}
                            onChange={(e) => {
                              setNewUser(p => ({
                                ...p,
                                department_ids: e.target.checked
                                  ? [...p.department_ids, d.id]
                                  : p.department_ids.filter(id => id !== d.id),
                              }));
                            }}
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </div>
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
    </div>
  );
}
