'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserAvatar } from '@/components/common/user-avatar';
import { MENTION_TOKEN } from '@/lib/validators/board';
import type { Profile } from '@/types';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: Profile[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

/** Matches an in-progress mention right before the caret: "@" + partial text. */
const ACTIVE_MENTION = /(^|\s)@([^\s@[\]()]*)$/;
const MAX_SUGGESTIONS = 6;

/** Serialise a member as the token stored in `comments.content`. */
export function mentionToken(member: Pick<Profile, 'id' | 'full_name'>): string {
  // Square brackets inside the name would break the token grammar.
  const safeName = member.full_name.replace(/[[\]]/g, '');
  return `@[${safeName}](${member.id})`;
}

/**
 * Textarea with an @mention popover. Typing "@" followed by text filters the
 * workspace members; arrow keys move, Enter/Tab picks, Esc closes. Picking
 * inserts `@[Full Name](uuid) ` so the id survives later renames.
 */
export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  rows = 3,
  disabled,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number>(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  const active = useMemo(() => {
    const before = value.slice(0, caret);
    const m = ACTIVE_MENTION.exec(before);
    if (!m) return null;
    const query = m[2] ?? '';
    const start = caret - query.length - 1; // index of the "@"
    return { query, start };
  }, [value, caret]);

  const suggestions = useMemo(() => {
    if (!active) return [];
    const q = active.query.trim().toLowerCase();
    return members
      .filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [active, members]);

  const key = active ? `${active.start}:${active.query}` : null;
  const open = Boolean(active) && suggestions.length > 0 && dismissedFor !== key && !disabled;

  useEffect(() => {
    setHighlight(0);
  }, [key]);

  // Restore caret after a programmatic insert (React re-renders the value first).
  useEffect(() => {
    if (pendingCaret.current === null) return;
    const el = ref.current;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    }
  }, [value]);

  function syncCaret() {
    const el = ref.current;
    if (el) setCaret(el.selectionStart ?? 0);
  }

  function pick(member: Profile) {
    if (!active) return;
    const token = `${mentionToken(member)} `;
    const next = value.slice(0, active.start) + token + value.slice(caret);
    pendingCaret.current = active.start + token.length;
    setDismissedFor(null);
    onChange(next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const member = suggestions[highlight] ?? suggestions[0];
      if (member) {
        e.preventDefault();
        pick(member);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissedFor(key);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        onBlur={() => {
          // Delay so a mousedown on a suggestion can win before we close.
          setTimeout(() => setDismissedFor(key), 150);
        }}
        aria-autocomplete="list"
        style={{
          width: '100%',
          padding: '0.8rem 1.2rem',
          fontSize: '1.4rem',
          lineHeight: 1.5,
          color: '#212b36',
          border: '1px solid #c4cdd5',
          borderRadius: '4px',
          resize: 'vertical',
          fontFamily: 'inherit',
          backgroundColor: disabled ? '#f4f6f8' : 'white',
          boxSizing: 'border-box',
        }}
      />

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: '0.4rem',
            zIndex: 30,
            minWidth: '26rem',
            maxWidth: '100%',
            listStyle: 'none',
            padding: '0.4rem',
            backgroundColor: 'white',
            border: '1px solid #dfe3e8',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(33, 43, 54, 0.14)',
          }}
        >
          {suggestions.map((p, i) => {
            const isActive = i === highlight;
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep textarea focus
                  pick(p);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#f4f5fc' : 'transparent',
                }}
              >
                <UserAvatar user={p} size="small" />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.full_name}
                  </span>
                  <span style={{ fontSize: '1.1rem', color: '#919eab', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.email}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Renders stored comment text, turning `@[Name](uuid)` tokens into indigo
 * pills. When `members` is provided the current display name is preferred
 * over the one frozen in the token.
 */
export function renderCommentContent(content: string, members?: Profile[]): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = new RegExp(MENTION_TOKEN.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(content)) !== null) {
    const [full, tokenName, id] = match;
    if (match.index > last) nodes.push(content.slice(last, match.index));
    const member = members?.find((m) => m.id === id);
    const name = member?.full_name ?? tokenName ?? '';
    nodes.push(
      <span
        key={`m-${i++}`}
        title={member?.email}
        style={{
          color: '#5c6ac4',
          backgroundColor: '#eef0fb',
          borderRadius: '4px',
          padding: '0 4px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        @{name}
      </span>,
    );
    last = match.index + full.length;
  }
  if (last < content.length) nodes.push(content.slice(last));
  if (nodes.length === 0) return content;
  return <>{nodes}</>;
}
