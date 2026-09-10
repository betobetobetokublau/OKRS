'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface InlineTextEditProps {
  /** Task id — writes `tasks.title` or `tasks.description`. */
  id: string;
  mode: 'title' | 'description';
  value: string | null;
  onChanged: () => void;
  placeholder?: string;
}

const TITLE_STYLE: React.CSSProperties = {
  fontSize: '2.4rem',
  fontWeight: 600,
  color: '#212b36',
  lineHeight: 1.25,
  margin: 0,
  letterSpacing: '-0.01em',
  fontFamily: 'inherit',
};

const BODY_STYLE: React.CSSProperties = {
  color: '#212b36',
  fontSize: '1.4rem',
  lineHeight: 1.6,
  margin: 0,
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
};

/**
 * Click-to-edit text for the task title (h1 typography, single line — render
 * it inside an <h1>) and the task description (auto-grown textarea). Same typography in read and edit mode
 * so the layout doesn't jump.
 *
 * - title: Enter or blur saves (trimmed, non-empty — empty reverts), Esc cancels.
 * - description: blur or ⌘/Ctrl+Enter saves (empty → null), Esc cancels.
 */
export function InlineTextEdit({ id, mode, value, onChanged, placeholder }: InlineTextEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState(false);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the draft in sync with upstream changes while not editing.
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Auto-grow the textarea to fit its content.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  function startEditing() {
    if (saving) return;
    cancelledRef.current = false;
    setDraft(value ?? '');
    setEditing(true);
  }

  function cancel() {
    cancelledRef.current = true;
    setDraft(value ?? '');
    setEditing(false);
  }

  async function commit() {
    if (cancelledRef.current) return;
    const trimmed = draft.trim();
    const current = value ?? '';
    if (mode === 'title' && trimmed.length === 0) {
      // Titles can't be empty — revert silently.
      setDraft(current);
      setEditing(false);
      return;
    }
    const next: string | null = mode === 'title' ? trimmed : trimmed.length === 0 ? null : draft.trimEnd();
    if ((next ?? '') === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const column = mode === 'title' ? 'title' : 'description';
    const { error } = await supabase.from('tasks').update({ [column]: next }).eq('id', id);
    setSaving(false);
    setEditing(false);
    if (error) {
      setDraft(current);
      return;
    }
    onChanged();
  }

  const isTitle = mode === 'title';

  if (editing) {
    if (isTitle) {
      return (
        <input
          ref={inputRef}
          autoFocus
          aria-label="Título de la tarea"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              // Don't let the side panel's window listener close the panel.
              e.preventDefault();
              e.stopPropagation();
              cancel();
            }
          }}
          style={{
            ...TITLE_STYLE,
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '0.2rem 0.6rem',
            marginLeft: '-0.6rem',
            border: '1px solid #5c6ac4',
            borderRadius: '4px',
            outline: 'none',
            backgroundColor: 'white',
            boxShadow: '0 0 0 3px rgba(92,106,196,0.15)',
          }}
        />
      );
    }
    return (
      <textarea
        ref={textareaRef}
        autoFocus
        aria-label="Descripción de la tarea"
        value={draft}
        disabled={saving}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }
        }}
        style={{
          ...BODY_STYLE,
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          minHeight: '7.2rem',
          padding: '0.6rem 0.8rem',
          marginLeft: '-0.8rem',
          resize: 'none',
          overflow: 'hidden',
          border: '1px solid #5c6ac4',
          borderRadius: '4px',
          outline: 'none',
          backgroundColor: 'white',
          boxShadow: '0 0 0 3px rgba(92,106,196,0.15)',
        }}
      />
    );
  }

  const empty = !value || value.trim().length === 0;

  if (isTitle) {
    // Rendered as a div: callers place it inside their own <h1> (AsanaDetailShell
    // does; the full page wraps it explicitly).
    return (
      <div
        role="button"
        tabIndex={0}
        title="Clic para editar el título"
        onClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startEditing();
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...TITLE_STYLE,
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.8rem',
          padding: '0.2rem 0.6rem',
          marginLeft: '-0.6rem',
          borderRadius: '4px',
          border: '1px solid transparent',
          backgroundColor: hover ? '#f9fafb' : 'transparent',
          cursor: 'text',
          transition: 'background-color 120ms',
          minWidth: 0,
        }}
      >
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
        <PencilIcon visible={hover} />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="Clic para editar la descripción"
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '0.6rem 0.8rem',
        marginLeft: '-0.8rem',
        borderRadius: '4px',
        border: '1px solid transparent',
        backgroundColor: hover ? '#f9fafb' : 'transparent',
        cursor: 'text',
        transition: 'background-color 120ms',
      }}
    >
      {empty ? (
        <p style={{ ...BODY_STYLE, color: '#919eab', fontSize: '1.3rem' }}>{placeholder ?? 'Agrega una descripción…'}</p>
      ) : (
        <p style={BODY_STYLE}>{value}</p>
      )}
    </div>
  );
}

function PencilIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#919eab"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: visible ? 1 : 0, transition: 'opacity 120ms', alignSelf: 'center' }}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
