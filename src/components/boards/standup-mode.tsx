'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { UserAvatar } from '@/components/common/user-avatar';
import { isTaskOverdue } from './board-filters';
import type { Board, BoardTask, Profile } from '@/types';

interface StandupModeProps {
  board: Board;
  /** Items after toolbar filters + sort. The rail derives people from their assignees. */
  items: BoardTask[];
  /** Page-owned Kanban render; receives the person-filtered items. */
  renderKanban: (items: BoardTask[], personSelected: boolean) => ReactNode;
  /** Esc closes only while no panel/modal sits above the overlay. */
  escEnabled: boolean;
  onClose: () => void;
}

interface Person {
  profile: Profile;
  total: number;
  overdue: number;
}

function orderKey(boardId: string) {
  return `kublau:board:${boardId}:standup-order`;
}

/**
 * Standup mode ("Rail clásico"): full-screen overlay above sidebar + topbar,
 * left rail of people, Kanban stage filtered to the active person. Pure view
 * mode — the only DB writes are the normal card interactions.
 */
export function StandupMode({ board, items, renderKanban, escEnabled, onClose }: StandupModeProps) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(orderKey(board.id)) : null;
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Fullscreen on enter, exit on leave. Errors (no user gesture, iframe policy) are ignored.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  // Leaving fullscreen via browser UI (Esc handled by the browser) also closes standup.
  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement) onClose();
    }
    // Only subscribe once fullscreen actually engaged; otherwise the initial state would close us.
    let subscribed = false;
    const timer = setTimeout(() => {
      if (document.fullscreenElement) {
        document.addEventListener('fullscreenchange', onFsChange);
        subscribed = true;
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      if (subscribed) document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [onClose]);

  useEffect(() => {
    if (!escEnabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [escEnabled, onClose]);

  const people = useMemo<Person[]>(() => {
    const map = new Map<string, Person>();
    for (const it of items) {
      const u = it.task?.assigned_user;
      if (!u) continue;
      const p = map.get(u.id) ?? { profile: u, total: 0, overdue: 0 };
      p.total += 1;
      if (isTaskOverdue(it)) p.overdue += 1;
      map.set(u.id, p);
    }
    const list = Array.from(map.values());
    const rank = (id: string) => {
      const i = order.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return list.sort((a, b) => rank(a.profile.id) - rank(b.profile.id) || a.profile.full_name.localeCompare(b.profile.full_name, 'es'));
  }, [items, order]);

  const ids = people.map((p) => p.profile.id);

  function persistOrder(next: string[]) {
    setOrder(next);
    try {
      window.sessionStorage.setItem(orderKey(board.id), JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    persistOrder(arrayMove(ids, from, to));
  }

  function handlePersonClick(id: string) {
    if (activeId === id) {
      // Toggle off: clear filter + un-mark.
      setActiveId(null);
      setDone((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setActiveId(id);
    setDone((prev) => new Set(prev).add(id));
  }

  const stageItems = activeId ? items.filter((it) => it.task?.assigned_user_id === activeId) : items;
  const spoken = ids.filter((id) => done.has(id)).length;
  const pct = ids.length > 0 ? Math.round((spoken / ids.length) * 100) : 0;
  const dateLabel = format(new Date(), 'EEEE d MMM', { locale: es }).replace('.', '');

  return (
    <div
      role="dialog"
      aria-label="Modo standup"
      style={{ position: 'fixed', inset: 0, zIndex: 180, backgroundColor: '#fff', display: 'flex', flexDirection: 'column', fontSize: '1.4rem' }}
    >
      {/* Top bar */}
      <header
        style={{
          height: '56px',
          minHeight: '56px',
          display: 'flex',
          alignItems: 'center',
          gap: '1.4rem',
          padding: '0 2rem',
          borderBottom: '1px solid #dfe3e8',
        }}
      >
        <span
          style={{
            backgroundColor: '#212b36',
            color: 'white',
            fontSize: '1.1rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '0.4rem 1rem',
            borderRadius: '999px',
          }}
        >
          STANDUP
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.8rem', fontSize: '1.6rem', fontWeight: 600, color: '#212b36' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: board.color, display: 'inline-block' }} />
          {board.name}
        </span>
        <span style={{ fontSize: '1.3rem', color: '#637381' }}>{dateLabel}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '1.3rem', color: '#637381' }}>
          {spoken} de {ids.length} han hablado
        </span>
        <span style={{ width: 140, height: 8, borderRadius: 4, backgroundColor: '#e4e5e7', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', backgroundColor: '#50b83c', transition: 'width 0.2s ease' }} />
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '0.6rem 1.4rem',
            fontSize: '1.3rem',
            fontWeight: 600,
            color: '#212b36',
            backgroundColor: 'white',
            border: '1px solid #212b36',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ■ Standup · salir
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Rail */}
        <aside
          style={{
            width: '250px',
            minWidth: '250px',
            backgroundColor: '#f9fafb',
            borderRight: '1px solid #dfe3e8',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.6rem 1.2rem',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '1.2rem', padding: '0 0.4rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#919eab', letterSpacing: '0.08em' }}>PERSONAS</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: '1.1rem', color: '#919eab' }}>Reordenar ⋮⋮</span>
          </div>

          {people.length === 0 ? (
            <p style={{ fontSize: '1.3rem', color: '#637381', padding: '0 0.4rem' }}>No hay tareas asignadas en este tablero.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {people.map((p) => (
                    <PersonRow
                      key={p.profile.id}
                      person={p}
                      state={activeId === p.profile.id ? 'active' : done.has(p.profile.id) ? 'done' : 'pending'}
                      onClick={() => handlePersonClick(p.profile.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <span style={{ flex: 1 }} />
          <p style={{ fontSize: '1.1rem', color: '#919eab', lineHeight: 1.5, margin: '1.6rem 0.4rem 0' }}>
            Clic = filtrar + marcar como hecho · clic de nuevo desmarca · arrastra ⋮⋮ para cambiar el orden
          </p>
        </aside>

        {/* Stage */}
        <main style={{ flex: 1, minWidth: 0, padding: '2rem 2.4rem', overflow: 'auto', backgroundColor: '#fff' }}>
          {renderKanban(stageItems, Boolean(activeId))}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
type PersonState = 'pending' | 'active' | 'done';

function PersonRow({ person, state, onClick }: { person: Person; state: PersonState; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: person.profile.id });
  const isDone = state === 'done';
  const isActive = state === 'active';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        padding: '0.9rem 0.8rem',
        borderRadius: '10px',
        backgroundColor: isDone ? '#f3faf1' : isActive ? '#eef0fb' : 'white',
        border: isActive ? '2px solid #5c6ac4' : isDone ? '1px solid #b5dbb0' : '1px solid #dfe3e8',
        cursor: 'pointer',
      }}
      onClick={onClick}
      role="button"
      aria-pressed={isDone || isActive}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
        onClick={(e) => e.stopPropagation()}
        style={{ color: '#c4cdd5', fontSize: '1.4rem', cursor: 'grab', letterSpacing: '-2px', userSelect: 'none', padding: '0 0.2rem' }}
      >
        ⋮⋮
      </span>
      <UserAvatar user={person.profile} size="medium" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '1.4rem',
            fontWeight: 600,
            color: isDone ? '#108043' : '#212b36',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {person.profile.full_name}
        </div>
        <div style={{ fontSize: '1.15rem', color: person.overdue > 0 ? '#bf0711' : '#637381' }}>
          {person.total} {person.total === 1 ? 'tarea' : 'tareas'} · {person.overdue} {person.overdue === 1 ? 'vencida' : 'vencidas'}
        </div>
      </div>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          minWidth: 22,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          fontWeight: 700,
          border: isDone ? '1.5px solid #108043' : isActive ? '1.5px solid #5c6ac4' : '1.5px solid #c4cdd5',
          backgroundColor: isDone ? '#108043' : 'white',
          color: isDone ? 'white' : '#5c6ac4',
        }}
      >
        {isDone ? '✓' : isActive ? '▶' : ''}
      </span>
    </div>
  );
}
