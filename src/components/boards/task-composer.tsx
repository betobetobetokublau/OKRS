'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createTaskOnBoard } from '@/hooks/use-boards';
import { PRIORITY_CHIPS } from '@/components/tasks/priority';
import { NO_DEPARTMENT_LABEL, type ObjectiveOptionGroup } from '@/hooks/use-objective-options';
import { UserIcon } from './assignee-popover';
import type { Profile, TaskPriority, TaskStatus } from '@/types';

interface TaskComposerProps {
  workspaceId: string;
  boardId: string;
  /** Section the new card lands in (null = "Sin sección"). */
  sectionId: string | null;
  members: Profile[];
  /** Objectives of the active period, one `<optgroup>` per department. */
  objectiveGroups: ObjectiveOptionGroup[];
  /** Pre-filled when composing inside a status / assignee column. */
  presetStatus?: TaskStatus;
  presetAssigneeId?: string | null;
  /** Denser single-row layout for the list view. */
  compact?: boolean;
  /** Called after every successful insert (the composer stays open, cleared). */
  onSaved: () => void;
  onCancel: () => void;
}

const CHIP_BASE: CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  height: '2.6rem',
  padding: '0 2.2rem 0 0.9rem',
  fontSize: '1.2rem',
  fontWeight: 500,
  borderRadius: '6px',
  backgroundColor: 'white',
  cursor: 'pointer',
  outline: 'none',
  maxWidth: '100%',
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23919eab' stroke-width='1.5' fill='none'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.8rem center',
};

function chipStyle(filled: boolean, extraLeft = 0): CSSProperties {
  return {
    ...CHIP_BASE,
    paddingLeft: `calc(0.9rem + ${extraLeft}px)`,
    border: filled ? '1px solid #c4cdd5' : '1px dashed #c4cdd5',
    color: filled ? '#212b36' : '#637381',
  };
}

/**
 * Inline "new task" card (Asana-style). Enter saves and keeps the composer
 * open with cleared fields so several tasks can be typed in a row; Esc
 * cancels; clicking outside saves when a title is present, else cancels.
 */
export function TaskComposer({
  workspaceId,
  boardId,
  sectionId,
  members,
  objectiveGroups,
  presetStatus,
  presetAssigneeId,
  compact,
  onSaved,
  onCancel,
}: TaskComposerProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [assignee, setAssignee] = useState<string>(presetAssigneeId ?? '');
  const [objective, setObjective] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Latest values for the outside-click handler without re-binding it on every keystroke.
  const latest = useRef({ title, saving });
  latest.current = { title, saving };

  async function save(): Promise<boolean> {
    const name = title.trim();
    if (!name || saving) return false;
    setSaving(true);
    setError(null);
    const { error: err } = await createTaskOnBoard(boardId, sectionId, {
      workspace_id: workspaceId,
      title: name,
      priority: priority || null,
      assigned_user_id: assignee || null,
      objective_id: objective || null,
      status: presetStatus && presetStatus !== 'blocked' ? presetStatus : 'pending',
    });
    setSaving(false);
    if (err) {
      setError(err);
      return false;
    }
    setTitle('');
    setPriority('');
    setObjective('');
    setAssignee(presetAssigneeId ?? '');
    onSaved();
    requestAnimationFrame(() => inputRef.current?.focus());
    return true;
  }

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      if (latest.current.saving) return;
      if (latest.current.title.trim()) {
        // Save then close; the parent refreshes on onSaved.
        void save().then((ok) => {
          if (ok) onCancel();
        });
      } else {
        onCancel();
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const chips = (
    <>
      <select aria-label="Prioridad" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | '')} onKeyDown={onKeyDown} style={chipStyle(Boolean(priority))}>
        <option value="">Prioridad</option>
        {(Object.keys(PRIORITY_CHIPS) as TaskPriority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_CHIPS[p].glyph} {PRIORITY_CHIPS[p].label}
          </option>
        ))}
      </select>
      <span style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}>
        <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', pointerEvents: 'none' }}>
          <UserIcon size={12} color={assignee ? '#637381' : '#919eab'} />
        </span>
        <select aria-label="Asignado" value={assignee} onChange={(e) => setAssignee(e.target.value)} onKeyDown={onKeyDown} style={chipStyle(Boolean(assignee), 16)}>
          <option value="">Asignado</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </span>
      <select aria-label="Objetivo" value={objective} onChange={(e) => setObjective(e.target.value)} onKeyDown={onKeyDown} style={chipStyle(Boolean(objective))}>
        <option value="">Objetivo</option>
        {objectiveGroups.map((g) => (
          <optgroup key={g.department?.id ?? 'none'} label={g.department?.name ?? NO_DEPARTMENT_LABEL}>
            {g.objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  );

  const input = (
    <input
      ref={inputRef}
      autoFocus
      value={title}
      disabled={saving}
      placeholder="Escribe el nombre de la tarea"
      aria-label="Nombre de la tarea"
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={onKeyDown}
      style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: compact ? '1.3rem' : '1.35rem', fontWeight: 500, color: '#212b36', padding: 0 }}
    />
  );

  const check = <span aria-hidden style={{ width: 18, height: 18, minWidth: 18, borderRadius: '50%', border: '1.5px solid #c4cdd5', display: 'inline-block' }} />;

  if (compact) {
    return (
      <div ref={rootRef} onClick={stop} onPointerDown={stop} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1.2rem', backgroundColor: '#fbfbfc', borderTop: '1px solid #f1f3f5', flexWrap: 'wrap' }}>
        {check}
        {input}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>{chips}</div>
        <Status saving={saving} error={error} />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      onClick={stop}
      onPointerDown={stop}
      style={{
        backgroundColor: 'white',
        border: '1px solid #5c6ac4',
        boxShadow: '0 0 0 2px rgba(92,106,196,0.15)',
        borderRadius: '9px',
        padding: '10px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        {check}
        {input}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem', paddingLeft: 26 }}>{chips}</div>
      <Status saving={saving} error={error} />
    </div>
  );
}

function Status({ saving, error }: { saving: boolean; error: string | null }) {
  if (error) return <p style={{ margin: 0, fontSize: '1.1rem', color: '#bf0711' }}>{error}</p>;
  return (
    <p style={{ margin: 0, fontSize: '1.1rem', color: '#919eab' }}>
      {saving ? 'Guardando…' : 'Enter para guardar · Esc para cancelar'}
    </p>
  );
}
