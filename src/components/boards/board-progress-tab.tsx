'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { UserAvatar } from '@/components/common/user-avatar';
import { StaticChip } from '@/components/okrs/inline-status-select';
import { boardStatusChip, BOARD_STATUS_OPTIONS } from '@/components/okrs/status-chips';
import { useLiveRefetch } from '@/components/comments/use-live-comments';
import {
  createBoardUpdate,
  createMilestone,
  deleteBoardUpdate,
  deleteMilestone,
  setMilestoneDone,
  useBoardMilestones,
  useBoardUpdates,
  useMonitoredOverview,
} from '@/hooks/use-board-progress';
import { formatMilestoneDate, isMilestoneOverdue, sortMilestones, summarizeMilestones, taskStats, todayISO } from './board-progress';
import { BoardStatusSelect } from './board-status-select';
import { formatRelative } from '@/lib/utils/dates';
import { INPUT_STYLE, TEXTAREA_STYLE } from '@/lib/styles/form';
import type { Board, BoardMilestone, BoardStatus, BoardTask, BoardUpdate } from '@/types';

interface BoardProgressTabProps {
  slug: string;
  board: Board;
  items: BoardTask[];
  canEdit: boolean;
  /** Board row changed (status); parent refetches. */
  onBoardChanged: () => void;
}

const CARD = { backgroundColor: 'white', border: '1px solid #dfe3e8', borderRadius: '10px', padding: '1.6rem' } as const;
const H2 = { fontSize: '1.4rem', fontWeight: 600, color: '#212b36', margin: 0 } as const;
const MUTED = { fontSize: '1.2rem', color: '#919eab' } as const;
const BTN_PRIMARY = { padding: '0.7rem 1.4rem', fontSize: '1.3rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '6px', cursor: 'pointer' } as const;

/**
 * "Avances" tab of a board: project status + task roll-up, the updates
 * timeline (posts with optional status), milestones and recent task activity.
 * Updates and milestones never touch tasks.
 */
export function BoardProgressTab({ slug, board, items, canEdit, onBoardChanged }: BoardProgressTabProps) {
  const { profile, currentWorkspace } = useWorkspaceStore();
  const { updates, loading: loadingUpdates, refetch: refetchUpdates } = useBoardUpdates(board.id);
  const { milestones, refetch: refetchMilestones } = useBoardMilestones(board.id);
  const boardsForOverview = useMemo(() => [board], [board]);
  const { overview } = useMonitoredOverview(boardsForOverview, currentWorkspace?.id);
  const activity = overview[board.id]?.activity ?? [];

  useLiveRefetch(
    `board-progress-${board.id}`,
    [
      { table: 'board_updates', filter: `board_id=eq.${board.id}` },
      { table: 'board_milestones', filter: `board_id=eq.${board.id}` },
    ],
    () => {
      refetchUpdates();
      refetchMilestones();
    },
  );

  const stats = useMemo(() => taskStats(items.filter((it) => it.task).map((it) => it.task!)), [items]);
  const today = todayISO();
  const msSummary = summarizeMilestones(milestones, today);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: '1.6rem', alignItems: 'start' }}>
      {/* ── Left: updates timeline ─────────────────────────────────────── */}
      <section style={CARD} aria-labelledby="avances-title">
        <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', marginBottom: '1.2rem' }}>
          <h2 id="avances-title" style={H2}>
            Avances
          </h2>
          <span style={{ ...MUTED, fontVariantNumeric: 'tabular-nums' }}>{updates.length}</span>
        </header>

        {canEdit && profile && currentWorkspace && (
          <UpdateComposer
            boardId={board.id}
            workspaceId={currentWorkspace.id}
            authorId={profile.id}
            onPosted={(status) => {
              refetchUpdates();
              if (status) onBoardChanged();
            }}
          />
        )}

        {loadingUpdates ? (
          <p style={{ ...MUTED, margin: '1.2rem 0 0' }}>Cargando…</p>
        ) : updates.length === 0 ? (
          <p style={{ ...MUTED, margin: '1.2rem 0 0', fontSize: '1.3rem' }}>Aún no hay avances. El primero marca el arranque del proyecto.</p>
        ) : (
          <Timeline updates={updates} meId={profile?.id ?? null} onDeleted={refetchUpdates} />
        )}
      </section>

      {/* ── Right: status, milestones, activity ───────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
        <section style={CARD} aria-labelledby="estado-title">
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.2rem' }}>
            <h2 id="estado-title" style={H2}>
              Estado del proyecto
            </h2>
            <BoardStatusSelect boardId={board.id} status={board.status} canEdit={canEdit} onChanged={onBoardChanged} />
          </header>
          <ProgressBar pct={stats.pct} />
          <p style={{ margin: '0.8rem 0 0', fontSize: '1.3rem', color: '#637381' }}>
            <strong style={{ color: '#212b36' }}>{stats.completed}</strong> de {stats.total} {stats.total === 1 ? 'tarea completada' : 'tareas completadas'}
            {stats.overdue > 0 && (
              <>
                {' · '}
                <span style={{ color: '#bf0711' }}>
                  {stats.overdue} {stats.overdue === 1 ? 'vencida' : 'vencidas'}
                </span>
              </>
            )}
            {stats.blocked > 0 && (
              <>
                {' · '}
                <span style={{ color: '#50248f' }}>
                  {stats.blocked} {stats.blocked === 1 ? 'bloqueada' : 'bloqueadas'}
                </span>
              </>
            )}
          </p>
          {!board.is_monitored && (
            <p style={{ ...MUTED, margin: '0.8rem 0 0' }}>Este tablero no está marcado como proyecto monitoreado; actívalo en Configuración para verlo en la lista de proyectos.</p>
          )}
        </section>

        <section style={CARD} aria-labelledby="hitos-title">
          <header style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', marginBottom: '1.2rem' }}>
            <h2 id="hitos-title" style={H2}>
              Hitos
            </h2>
            {msSummary.total > 0 && (
              <span style={{ ...MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {msSummary.done} de {msSummary.total}
                {msSummary.overdue > 0 && <span style={{ color: '#bf0711' }}> · {msSummary.overdue} {msSummary.overdue === 1 ? 'vencido' : 'vencidos'}</span>}
              </span>
            )}
          </header>
          {milestones.length === 0 ? (
            <p style={{ ...MUTED, margin: '0 0 1rem', fontSize: '1.3rem' }}>Sin hitos. Agrega fechas clave: entregas, demos, cierres.</p>
          ) : (
            <MilestoneList milestones={milestones} today={today} canEdit={canEdit} onChanged={refetchMilestones} />
          )}
          {canEdit && profile && currentWorkspace && <MilestoneComposer boardId={board.id} workspaceId={currentWorkspace.id} createdBy={profile.id} onAdded={refetchMilestones} />}
        </section>

        <section style={CARD} aria-labelledby="actividad-title">
          <h2 id="actividad-title" style={{ ...H2, marginBottom: '1.2rem' }}>
            Actividad reciente
          </h2>
          {activity.length === 0 ? (
            <p style={{ ...MUTED, margin: 0, fontSize: '1.3rem' }}>Sin movimientos en las tareas de este tablero.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {activity.map((e) => (
                <li key={e.id} style={{ display: 'flex', gap: '0.8rem', fontSize: '1.3rem', color: '#212b36', lineHeight: 1.45 }}>
                  {e.actor ? <UserAvatar user={e.actor} size="small" /> : <span style={{ width: 24 }} />}
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{e.actor?.full_name ?? 'Alguien'}</span> {e.body}{' '}
                    <Link href={`/${slug}/tareas/${e.taskId}`} style={{ color: '#5c6ac4', textDecoration: 'none' }}>
                      “{e.taskTitle}”
                    </Link>
                    <div style={MUTED}>{formatRelative(e.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 4, backgroundColor: '#f1f2f4', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 100 ? '#108043' : '#5c6ac4', transition: 'width 0.3s ease' }} />
    </div>
  );
}

function UpdateComposer({ boardId, workspaceId, authorId, onPosted }: { boardId: string; workspaceId: string; authorId: string; onPosted: (status: BoardStatus | null) => void }) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<BoardStatus | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = content.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const { error: err } = await createBoardUpdate({ boardId, workspaceId, authorId, content: trimmed, status: status || null });
    setSaving(false);
    if (err) {
      setError('No pudimos publicar el avance. Intenta de nuevo.');
      return;
    }
    const posted = status || null;
    setContent('');
    setStatus('');
    onPosted(posted);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.6rem', paddingBottom: '1.6rem', borderBottom: '1px solid #f1f2f4' }}>
      <textarea
        aria-label="Nuevo avance"
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="¿Qué avanzó, qué se atoró, qué sigue?"
        style={{ ...TEXTAREA_STYLE, fontSize: '1.3rem' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.2rem', color: '#637381' }}>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value as BoardStatus | '')} style={{ ...INPUT_STYLE, width: 'auto', padding: '0.5rem 0.8rem', fontSize: '1.2rem' }}>
            <option value="">Sin cambio</option>
            {BOARD_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {status && <span style={MUTED}>El proyecto pasará a “{boardStatusChip(status).label}”.</span>}
        <span style={{ flex: 1 }} />
        {error && <span style={{ fontSize: '1.2rem', color: '#bf0711' }}>{error}</span>}
        <button type="submit" disabled={!trimmed || saving} style={{ ...BTN_PRIMARY, opacity: !trimmed || saving ? 0.6 : 1, cursor: !trimmed || saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Publicando…' : 'Publicar avance'}
        </button>
      </div>
    </form>
  );
}

function Timeline({ updates, meId, onDeleted }: { updates: BoardUpdate[]; meId: string | null; onDeleted: () => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  async function remove(id: string) {
    await deleteBoardUpdate(id);
    setConfirmId(null);
    onDeleted();
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
      <span aria-hidden style={{ position: 'absolute', left: 11, top: 8, bottom: 8, width: 2, backgroundColor: '#e4e5e7' }} />
      {updates.map((u) => {
        const chip = u.status ? boardStatusChip(u.status) : null;
        const mine = Boolean(meId && u.author_id === meId);
        return (
          <li key={u.id} style={{ position: 'relative', display: 'flex', gap: '1.2rem', padding: '0 0 1.6rem' }}>
            <span aria-hidden style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: 'white', border: `2px solid ${chip?.dot ?? '#c4cdd5'}`, flexShrink: 0, position: 'relative', zIndex: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                {u.author && <UserAvatar user={u.author} size="small" />}
                <span style={{ fontSize: '1.3rem', fontWeight: 600, color: '#212b36' }}>{u.author?.full_name ?? 'Usuario'}</span>
                <span style={MUTED}>{formatRelative(u.created_at)}</span>
                {chip && <StaticChip chip={chip} />}
                <span style={{ flex: 1 }} />
                {mine &&
                  (confirmId === u.id ? (
                    <span style={{ display: 'inline-flex', gap: '0.6rem', alignItems: 'center', fontSize: '1.2rem', color: '#637381' }}>
                      ¿Eliminar?
                      <button type="button" onClick={() => remove(u.id)} style={{ border: 'none', background: 'none', color: '#bf0711', fontWeight: 600, cursor: 'pointer', fontSize: '1.2rem' }}>
                        Sí
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} style={{ border: 'none', background: 'none', color: '#637381', cursor: 'pointer', fontSize: '1.2rem' }}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" aria-label="Eliminar avance" onClick={() => setConfirmId(u.id)} style={{ border: 'none', background: 'none', color: '#c4cdd5', cursor: 'pointer', fontSize: '1.6rem', lineHeight: 1, padding: '0 0.2rem' }}>
                      ×
                    </button>
                  ))}
              </div>
              <p style={{ margin: 0, fontSize: '1.3rem', color: '#212b36', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{u.content}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MilestoneList({ milestones, today, canEdit, onChanged }: { milestones: BoardMilestone[]; today: string; canEdit: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(m: BoardMilestone) {
    setBusy(m.id);
    await setMilestoneDone(m.id, !m.done);
    setBusy(null);
    onChanged();
  }
  async function remove(id: string) {
    setBusy(id);
    await deleteMilestone(id);
    setBusy(null);
    onChanged();
  }
  return (
    <ul style={{ listStyle: 'none', margin: '0 0 1.2rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {sortMilestones(milestones).map((m) => {
        const overdue = isMilestoneOverdue(m, today);
        return (
          <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1.3rem' }}>
            <input
              type="checkbox"
              aria-label={m.done ? `Marcar “${m.title}” como pendiente` : `Marcar “${m.title}” como hecho`}
              checked={m.done}
              disabled={!canEdit || busy === m.id}
              onChange={() => toggle(m)}
              style={{ width: 16, height: 16, cursor: canEdit ? 'pointer' : 'default' }}
            />
            <span style={{ flex: 1, minWidth: 0, color: m.done ? '#919eab' : '#212b36', textDecoration: m.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
            <span style={{ fontSize: '1.2rem', color: overdue ? '#bf0711' : m.done ? '#919eab' : '#637381', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatMilestoneDate(m.due_date)}
              {overdue && ' · vencido'}
            </span>
            {canEdit && (
              <button type="button" aria-label={`Eliminar hito ${m.title}`} onClick={() => remove(m.id)} disabled={busy === m.id} style={{ border: 'none', background: 'none', color: '#c4cdd5', cursor: 'pointer', fontSize: '1.6rem', lineHeight: 1, padding: '0 0.2rem' }}>
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MilestoneComposer({ boardId, workspaceId, createdBy, onAdded }: { boardId: string; workspaceId: string; createdBy: string; onAdded: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const ok = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || saving) return;
    setSaving(true);
    await createMilestone({ boardId, workspaceId, title: title.trim(), dueDate: date, createdBy });
    setSaving(false);
    setTitle('');
    onAdded();
  }
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <input aria-label="Título del hito" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nuevo hito, ej. Demo con cliente" style={{ ...INPUT_STYLE, flex: '1 1 140px', fontSize: '1.3rem', padding: '0.6rem 1rem' }} />
      <input aria-label="Fecha del hito" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, width: 'auto', fontSize: '1.3rem', padding: '0.6rem 1rem' }} />
      <button type="submit" disabled={!ok || saving} style={{ ...BTN_PRIMARY, padding: '0.6rem 1.2rem', opacity: !ok || saving ? 0.6 : 1, cursor: !ok || saving ? 'not-allowed' : 'pointer' }}>
        Agregar
      </button>
    </form>
  );
}
