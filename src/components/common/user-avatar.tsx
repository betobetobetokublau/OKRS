'use client';

import type { Profile } from '@/types';

interface UserAvatarProps {
  user: Profile;
  size?: 'small' | 'medium' | 'large';
}

const SIZES = { small: '24px', medium: '32px', large: '40px' };
const FONT_SIZES = { small: '1rem', medium: '1.2rem', large: '1.4rem' };

const COLORS = ['#47c1bf', '#de3618', '#f49342', '#50b83c', '#006fbb', '#9c6ade'];

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function UserAvatar({ user, size = 'medium' }: UserAvatarProps) {
  const dimension = SIZES[size];
  const bg = getColor(user.full_name);

  if (user.avatar_url) {
    return (
      <div
        className="Polaris-Avatar"
        style={{ width: dimension, height: dimension, minWidth: dimension }}
      >
        <img
          className="Polaris-Avatar__Image"
          src={user.avatar_url}
          alt={user.full_name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      </div>
    );
  }

  return (
    <div
      className="Polaris-Avatar"
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        backgroundColor: bg,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: FONT_SIZES[size],
        fontWeight: 600,
      }}
    >
      {getInitials(user.full_name)}
    </div>
  );
}
