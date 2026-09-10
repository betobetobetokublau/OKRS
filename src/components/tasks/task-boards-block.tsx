'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useBoards, fetchTaskBoards, addTaskToBoard, moveTask, removeTaskFromBoard } from '@/hooks/use-boards';
import type { BoardSection, BoardTask, Task } from '@/types';

interface TaskBoardsBlockProps {
  task: Pick<Task, 'id' | 'workspace_id'>;
  canEdit: boolean;
  onChanged?: () => void;
}

const CHEVRON_DOWN = 'M6 9l6 6 6-6';

/**
 * Value renderer for the "Tableros" field of a task: one line per board the
 * task is placed on (colour square + name + section pill + remove), plus an
 * "Agregar a tablero" affordance that lists boards not yet containing it.
 */
export function TaskBoardsBlock({ task, canEdit, onChanged }: TaskBoardsBlockProps) {
  const slug = useWorkspaceStore((s) => s.currentWorkspace?.slug);
  const { boards } = useBoards(task.workspace_id);
  const [placements, setPlacements] = useState<BoardTask[]>([]);
  const [sectionsByBoard, setSectionsByBoard] = useState<Record<string, BoardSection[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const rows = await fetchTaskBoards(task.id);
    setPlacements(rows);
    const boardIds = rows.map((r) => r.board_id);
    if (boardIds.length > 0) {
      const supabase = createClient();
      const { data } = await supabase
        .from('board_sections')
        .select('*')
        .in('board_id', boardIds)
        .order('position', { ascending: true });
      const grouped: Record<string, BoardSection[]> = {};
      for (const s of (data || []) as BoardSection[]) {
        (grouped[s.board_id] ??= []).push(s);
      }
      setSectionsByBoard(grouped);
    } else {
      setSectionsByBoard({});
    }
    setLoading(false);
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load]);

  function refresh() {
    load();
    onChanged?.();
  }

  const placedIds = useMemo(() => new Set(placements.map((p) => p.board_id)), [placements]);
  const available = boards.filter((b) => !placedIds.has(b.id));

  async function handleMove(p: BoardTask, sectionId: string) {
    setBusy(true);
    await moveTask(p.board_id, task.id, sectionId || null, 0);
    setBusy(false);
    refresh();
  }

  async function handleRemove(p: BoardTask) {
    setBusy(true);
    await removeTaskFromBoard(p.board_id, task.id);
    setBusy(false);
    refresh();
  }

  async function handleAdd(boardId: string) {
    if (!boardId) return;
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('board_sections')
      .select('id')
      .eq('board_id', boardId)
      .order('position', { ascending: true })
      .limit(1);
    const first = (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
    await addTaskToBoard(boardId, task.id, first);
    setBusy(false);
    setAdding(false);
    refresh();
  }

  if (loading) {
    return <span style={{ color: '#919eab' }}>Cargando...</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', opacity: busy ? 0.6 : 1 }}>
      {placements.length === 0 && !canEdit && <span style={{ color: '#919eab' }}>En ningún tablero</span>}

      {placements.map((p) => {
        const board = p.board;
        if (!board) return null;
        const sections = sectionsByBoard[board.id] ?? [];
        const href = slug ? `/${slug}/tableros/${board.id}` : undefined;
        return (
          <div key={p.board_id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
            <span aria-hidden style={{ width: '1.2rem', height: '1.2rem', borderRadius: '3px', backgroundColor: board.color, flexShrink: 0 }} />
            {href ? (
              <Link
                href={href}
                style={{ color: '#212b36', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '18rem' }}
              >
                {board.name}
              </Link>
            ) : (
              <span style={{ color: '#212b36', fontWeight: 500 }}>{board.name}</span>
            )}

            <PillSelect
              ariaLabel={`Sección en ${board.name}`}
              value={p.section_id ?? ''}
              disabled={!canEdit || busy}
              onChange={(v) => handleMove(p, v)}
              options={[
                ...(p.section_id ? [] : [{ value: '', label: 'Sin sección' }]),
                ...sections.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />

            {canEdit && (
              <button
                type="button"
                onClick={() => handleRemove(p)}
                disabled={busy}
                aria-label={`Quitar del tablero ${board.name}`}
                title="Quitar del tablero"
                style={{ border: 'none', background: 'transparent', color: '#919eab', fontSize: '1.6rem', lineHeight: 1, cursor: 'pointer', padding: '0 0.2rem' }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {canEdit && (
        adding ? (
          <PillSelect
            ariaLabel="Elegir tablero"
            value=""
            disabled={busy}
            autoFocus
            onChange={(v) => handleAdd(v)}
            onBlur={() => setAdding(false)}
            options={[
              { value: '', label: available.length === 0 ? 'No hay más tableros' : 'Elegir tablero…' },
              ...available.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={busy}
            style={{
              alignSelf: 'flex-start',
              border: 'none',
              background: 'transparent',
              color: '#5c6ac4',
              fontSize: '1.3rem',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '0.2rem 0',
            }}
          >
            + Agregar a tablero
          </button>
        )
      )}
    </div>
  );
}

interface PillSelectProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel: string;
}

/** Small pill-shaped native select (same vocabulary as the inline status/user selects). */
function PillSelect({ value, options, onChange, onBlur, disabled, autoFocus, ariaLabel }: PillSelectProps) {
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minWidth: '11rem' }}>
      <div
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 2.2rem 0 0.8rem',
          fontSize: '1.2rem',
          color: value ? '#212b36' : '#919eab',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current}</span>
      </div>
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#637381"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <path d={CHEVRON_DOWN} />
      </svg>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          height: '2.6rem',
          padding: '0 2.2rem 0 0.8rem',
          border: '1px solid #dfe3e8',
          borderRadius: '10rem',
          backgroundColor: '#f4f6f8',
          fontSize: '1.2rem',
          color: 'transparent',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          cursor: disabled ? 'default' : 'pointer',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value || '__none'} value={o.value} style={{ color: '#212b36' }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
