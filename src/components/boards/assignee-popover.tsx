'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserAvatar } from '@/components/common/user-avatar';
import { updateTaskAssignee } from '@/hooks/use-boards';
import type { Profile } from '@/types';

interface AssigneePopoverProps {
  taskId: string;
  current: Profile | null | undefined;
  members: Profile[];
  canEdit: boolean;
  size?: 'small' | 'medium';
  /** Show the assignee name next to the avatar (list rows). */
  withName?: boolean;
  onChanged: () => void;
}

const PX = { small: 24, medium: 32 };

/** Grey person glyph used inside the dashed "sin responsable" circle. */
export function UserIcon({ size = 12, color = '#919eab' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

/**
 * Compact assignee picker rendered right where the avatar sits (card footer,
 * list cell). Clicks never bubble, so the surrounding card/row doesn't open
 * its detail panel. Writes `tasks.assigned_user_id` and asks the parent to
 * refresh.
 */
export function AssigneePopover({ taskId, current, members, canEdit, size = 'small', withName, onChanged }: AssigneePopoverProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  /** Viewport anchor for the fixed popover (the card/row sits inside a scroll container that would clip an absolute one). */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const px = PX[size];

  function toggleOpen() {
    if (!canEdit) return;
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const width = 240;
      const left = Math.min(r.left, window.innerWidth - width - 8);
      const openUp = r.bottom + 300 > window.innerHeight;
      setAnchor({ top: openUp ? r.top - 4 : r.bottom + 4, left: Math.max(8, left) });
      setOpenUpward(openUp);
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }
    const close = () => setOpen(false);
    // A fixed popover would drift away from its trigger when a container scrolls; close it
    // (but not when the scroll happens inside the popover's own list).
    function onScroll(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) : members;
  }, [members, query]);

  async function choose(id: string | null) {
    if (saving) return;
    if ((current?.id ?? null) === id) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const { error } = await updateTaskAssignee(taskId, id);
    setSaving(false);
    setOpen(false);
    setQuery('');
    if (!error) onChanged();
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div ref={ref} onClick={stop} onPointerDown={stop} onKeyDown={stop} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={current ? `Responsable: ${current.full_name}` : 'Asignar responsable'}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!canEdit}
        onClick={toggleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: canEdit ? 'pointer' : 'default',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {current ? (
          <UserAvatar user={current} size={size} />
        ) : (
          <span
            style={{
              width: px,
              height: px,
              minWidth: px,
              borderRadius: '50%',
              border: '1.5px dashed #c4cdd5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserIcon size={Math.round(px * 0.5)} />
          </span>
        )}
        {withName && <span style={{ fontSize: '1.3rem', color: current ? '#212b36' : '#919eab' }}>{current ? current.full_name : 'Sin asignar'}</span>}
      </button>

      {open && anchor && (
        <div
          role="listbox"
          aria-label="Responsable"
          style={{
            position: 'fixed',
            top: openUpward ? undefined : anchor.top,
            bottom: openUpward ? window.innerHeight - anchor.top : undefined,
            left: anchor.left,
            width: 240,
            backgroundColor: 'white',
            border: '1px solid #dfe3e8',
            borderRadius: '8px',
            boxShadow: '0 6px 20px rgba(33,43,54,0.14)',
            padding: '0.6rem',
            zIndex: 70,
          }}
        >
          {members.length > 6 && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar persona"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.8rem', fontSize: '1.2rem', border: '1px solid #c4cdd5', borderRadius: '5px', marginBottom: '0.4rem' }}
            />
          )}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            <Option selected={!current} onClick={() => choose(null)}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px dashed #c4cdd5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserIcon />
              </span>
              <span style={{ color: '#637381' }}>Sin asignar</span>
            </Option>
            {filtered.map((m) => (
              <Option key={m.id} selected={current?.id === m.id} onClick={() => choose(m.id)}>
                <UserAvatar user={m} size="small" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name}</span>
              </Option>
            ))}
            {filtered.length === 0 && <p style={{ margin: '0.6rem 0.8rem', fontSize: '1.2rem', color: '#919eab' }}>Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        width: '100%',
        textAlign: 'left',
        padding: '0.5rem 0.8rem',
        fontSize: '1.3rem',
        color: '#212b36',
        backgroundColor: selected ? '#eef0fb' : hover ? '#f4f6f8' : 'transparent',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
