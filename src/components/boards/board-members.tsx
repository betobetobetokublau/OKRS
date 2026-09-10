'use client';

import { UserAvatar } from '@/components/common/user-avatar';
import type { Profile } from '@/types';

interface BoardMembersProps {
  members: Profile[];
  /** Opens the settings modal. */
  onClick?: () => void;
  max?: number;
}

/** Stacked member avatars (max N + "+rest") shown in the board header. */
export function BoardMembers({ members, onClick, max = 5 }: BoardMembersProps) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  const names = members.map((m) => m.full_name).join(', ');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={names}
      aria-label={`Miembros del tablero: ${names}`}
      style={{ display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', padding: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      {shown.map((m, i) => (
        <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: '50%', boxShadow: '0 0 0 2px white', display: 'inline-flex', zIndex: shown.length - i, position: 'relative' }}>
          <UserAvatar user={m} size="small" />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{
            marginLeft: -8,
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: '#dfe3e8',
            color: '#454f5b',
            fontSize: '1rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 2px white',
            position: 'relative',
          }}
        >
          +{rest}
        </span>
      )}
    </button>
  );
}
