'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

interface InlineUserSelectProps {
  /** Currently only 'task' is supported (assigned_user_id). */
  entity: 'task';
  id: string;
  workspaceId: string;
  currentUserId: string | null;
  currentUser?: Profile | null;
  canEdit: boolean;
  onChanged: () => void;
}

const CHEVRON_DOWN = 'M6 9l6 6 6-6';

/**
 * Inline select for assigning a task to a workspace member. Native <select>
 * styled as a pill; visual twin of InlineTeamSelect but loads users from the
 * `user_workspaces` table and writes to `tasks.assigned_user_id`.
 *
 * Loads the user list lazily on mount (one supabase call per row). This is
 * fine for typical workspace sizes; if it ever becomes a perf issue, the
 * caller can lift the fetch.
 */
export function InlineUserSelect({
  entity,
  id,
  workspaceId,
  currentUserId,
  currentUser,
  canEdit,
  onChanged,
}: InlineUserSelectProps) {
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string>(currentUserId ?? '');
  const [users, setUsers] = useState<Profile[]>([]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    async function loadUsers() {
      const supabase = createClient();
      const { data } = await supabase
        .from('user_workspaces')
        .select('profile:profiles(*)')
        .eq('workspace_id', workspaceId);
      if (cancelled) return;
      const list = (data || [])
        .map((uw: any) => uw.profile as Profile | null)
        .filter((p): p is Profile => Boolean(p));
      setUsers(list);
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, canEdit]);

  if (!canEdit) {
    const user = currentUser ?? users.find((u) => u.id === currentUserId);
    if (!user) return <span style={{ color: '#919eab' }}>—</span>;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.2rem 0.8rem',
          borderRadius: '10rem',
          backgroundColor: '#f4f6f8',
          color: '#212b36',
          fontSize: '1.2rem',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          border: '1px solid #dfe3e8',
        }}
      >
        {user.full_name}
      </span>
    );
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const next = e.target.value;
    setValue(next);
    setSaving(true);
    const supabase = createClient();
    const table = entity === 'task' ? 'tasks' : 'tasks';
    await supabase
      .from(table)
      .update({ assigned_user_id: next || null })
      .eq('id', id);
    setSaving(false);
    onChanged();
  }

  const selected =
    users.find((u) => u.id === value) ||
    (currentUser && currentUser.id === value ? currentUser : null);
  const labelText = selected ? selected.full_name : 'Sin asignar';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        minWidth: '14rem',
      }}
    >
      <div
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0 2.4rem 0 0.8rem',
          fontSize: '1.2rem',
          color: selected ? '#212b36' : '#919eab',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span
          style={{
            width: '0.8rem',
            height: '0.8rem',
            borderRadius: '50%',
            backgroundColor: selected ? '#5c6ac4' : '#c4cdd5',
            flexShrink: 0,
          }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelText}</span>
      </div>

      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#637381"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <path d={CHEVRON_DOWN} />
      </svg>

      <select
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={handleChange}
        disabled={saving}
        style={{
          width: '100%',
          height: '2.8rem',
          padding: '0.2rem 2.4rem 0.2rem 2.4rem',
          border: '1px solid #c4cdd5',
          borderRadius: '4px',
          backgroundColor: 'white',
          fontSize: '1.2rem',
          color: 'transparent',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          cursor: saving ? 'progress' : 'pointer',
          outline: 'none',
        }}
      >
        <option value="" style={{ color: '#212b36' }}>— Sin asignar —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id} style={{ color: '#212b36' }}>
            {u.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}
