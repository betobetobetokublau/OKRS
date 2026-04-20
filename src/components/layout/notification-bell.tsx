'use client';

import { useState } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { ActivityPanel } from './activity-panel';

interface NotificationBellProps {
  userId: string;
  workspaceId: string;
}

/**
 * Bell icon in the topbar. Click → opens the centralized ActivityPanel
 * (the team-wide activity timeline). The badge count still reflects the
 * user's unread targeted notifications (monthly review reminders, etc.).
 */
export function NotificationBell({ workspaceId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useNotificationStore();

  return (
    <>
      <button
        type="button"
        aria-label="Abrir actividad"
        onClick={() => setOpen(true)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.6rem',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#de3618',
              color: 'white',
              fontSize: '1rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <ActivityPanel open={open} onClose={() => setOpen(false)} workspaceId={workspaceId} />
    </>
  );
}
