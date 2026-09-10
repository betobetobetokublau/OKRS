'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserAvatar } from '@/components/common/user-avatar';
import { MENTION_TOKEN } from '@/lib/validators/board';
import type { Profile } from '@/types';
import { findMentionSpans, safeMentionName, serializeMentions, type MentionMember } from './mentions';

export { mentionToken, serializeMentions, deserializeMentions } from './mentions';

interface MentionTextareaProps {
  /** Display text: mentions appear as `@Nombre`. */
  value: string;
  /**
   * Called with the display text and its serialised form, where every
   * `@Nombre` of a known member is `@[Nombre](uuid)` (what gets stored).
   */
  onChange: (display: string, serialized: string) => void;
  members: Profile[];
  /**
   * Members referenced by an existing comment being edited (from
   * `deserializeMentions`). They stay resolvable even if they left the
   * workspace and no longer appear in `members`.
   */
  initialMentions?: MentionMember[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

/** Matches an in-progress mention right before the caret: "@" + partial text. */
const ACTIVE_MENTION = /(^|\s)@([^\s@[\]()]*)$/;
const MAX_SUGGESTIONS = 6;

/**
 * Box metrics shared by the textarea and its highlight backdrop. Both must
 * lay text out identically so the pills sit exactly under the typed names.
 */
const TEXT_BOX: React.CSSProperties = {
  margin: 0,
  padding: '0.8rem 1.2rem',
  fontSize: '1.4rem',
  lineHeight: 1.5,
  fontFamily: 'inherit',
  fontWeight: 400,
  letterSpacing: 'normal',
  border: '1px solid transparent',
  borderRadius: '4px',
  boxSizing: 'border-box',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  scrollbarGutter: 'stable',
  textAlign: 'left',
};

/**
 * Textarea with an @mention popover and live pills. Typing "@" followed by
 * text filters the workspace members; arrow keys move, Enter/Tab picks, Esc
 * closes. Picking inserts `@Nombre ` into the visible text; the pill is drawn
 * by a backdrop `div` positioned exactly behind the (transparent) textarea, so
 * the user keeps editing plain text with a normal caret. `onChange` also
 * receives the serialised `@[Nombre](uuid)` form for storage.
 */
export function MentionTextarea({
  value,
  onChange,
  members,
  initialMentions,
  placeholder,
  rows = 3,
  disabled,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number>(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const pendingCaret = useRef<number | null>(null);
  // Mentions inserted via the picker (plus any seeded ones): name → member.
  const [picked, setPicked] = useState<MentionMember[]>(() => initialMentions ?? []);

  // Picked mentions win over `members` so a renamed/removed member still
  // serialises to the id the user actually chose.
  const known = useMemo<MentionMember[]>(() => [...picked, ...members], [picked, members]);

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

  function syncScroll() {
    const el = ref.current;
    const bd = backdropRef.current;
    if (el && bd) {
      bd.scrollTop = el.scrollTop;
      bd.scrollLeft = el.scrollLeft;
    }
  }

  function emit(display: string, mentions: MentionMember[] = known) {
    onChange(display, serializeMentions(display, mentions));
  }

  function pick(member: Profile) {
    if (!active) return;
    const insert = `@${safeMentionName(member.full_name)} `;
    const next = value.slice(0, active.start) + insert + value.slice(caret);
    pendingCaret.current = active.start + insert.length;
    setDismissedFor(null);
    const nextPicked = picked.some((p) => p.id === member.id)
      ? picked
      : [...picked, { id: member.id, full_name: member.full_name }];
    setPicked(nextPicked);
    emit(next, [...nextPicked, ...members]);
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
      {/* Highlight backdrop: same text, transparent ink, pills behind names. */}
      <div
        ref={backdropRef}
        aria-hidden
        style={{
          ...TEXT_BOX,
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          userSelect: 'none',
          color: 'transparent',
          backgroundColor: disabled ? '#f4f6f8' : 'white',
        }}
      >
        {renderHighlightedText(value, known)}
      </div>

      <textarea
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          emit(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        onScroll={syncScroll}
        onBlur={() => {
          // Delay so a mousedown on a suggestion can win before we close.
          setTimeout(() => setDismissedFor(key), 150);
        }}
        aria-autocomplete="list"
        style={{
          ...TEXT_BOX,
          position: 'relative',
          display: 'block',
          width: '100%',
          color: '#212b36',
          borderColor: '#c4cdd5',
          backgroundColor: 'transparent',
          resize: 'vertical',
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
 * Backdrop content: the display text verbatim, with each known `@Nombre`
 * wrapped in a pill. Text stays transparent (the real textarea draws the
 * glyphs on top); only the pill background shows through.
 */
function renderHighlightedText(display: string, known: MentionMember[]): React.ReactNode {
  const spans = findMentionSpans(display, known);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  spans.forEach((span, i) => {
    if (span.start > last) nodes.push(display.slice(last, span.start));
    nodes.push(
      <span
        key={`p-${i}`}
        style={{
          backgroundColor: '#eef0fb',
          borderRadius: '4px',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {display.slice(span.start, span.end)}
      </span>,
    );
    last = span.end;
  });
  if (last < display.length) nodes.push(display.slice(last));
  // A trailing newline would collapse without a following glyph; the
  // zero-width space keeps the backdrop the same height as the textarea.
  nodes.push('\u200b');
  return <>{nodes}</>;
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
