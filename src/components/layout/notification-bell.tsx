'use client';

import { useState, useRef, useEffect } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { useNotifications } from '@/hooks/use-notifications';
import { formatRelative } from '@/lib/utils/dates';
import { useRouter } from 'next/navigation';

interface NotificationBellProps {
  userId: string;
  workspaceId: string;
}

export function NotificationBell({ userId, workspaceId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { notifications, unreadCount } = useNotificationStore();
  const { markNotificationAsRead } = useNotifications(userId, workspaceId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleNotificationClick(notification: { id: string; action_url: string | null }) {
    markNotificationAsRead(notification.id);
    if (notification.action_url) {
      router.push(notification.action_url);
    }
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#637381" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {open && (
        <div
          className="Polaris-Card"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: '360px',
            maxHeight: '480px',
            overflowY: 'auto',
            zIndex: 200,
            borderRadius: '8px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            marginTop: '4px',
          }}
        >
          <div
            style={{
              padding: '1.2rem 1.6rem',
              borderBottom: '1px solid #dfe3e8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '1.4rem', color: '#212b36' }}>Notificaciones</span>
            {unreadCount > 0 && (
              <span style={{ fontSize: '1.2rem', color: '#5c6ac4', fontWeight: 500 }}>
                {unreadCount} sin leer
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: '3.2rem', textAlign: 'center', color: '#637381', fontSize: '1.3rem' }}>
              No tienes notificaciones
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.slice(0, 20).map((n) => (
                <li
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '1.2rem 1.6rem',
                    borderBottom: '1px solid #f4f6f8',
                    cursor: 'pointer',
                    backgroundColor: n.read ? 'transparent' : '#f9fafb',
                    transition: 'background-color 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                    {!n.read && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#5c6ac4',
                          marginTop: '5px',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '1.3rem', color: '#212b36' }}>{n.title}</div>
                      <div style={{ fontSize: '1.2rem', color: '#637381', marginTop: '2px' }}>{n.message}</div>
                      <div style={{ fontSize: '1.1rem', color: '#919eab', marginTop: '4px' }}>
                        {formatRelative(n.created_at)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
