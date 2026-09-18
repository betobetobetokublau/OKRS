'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserAvatar } from '@/components/common/user-avatar';
import { StaticChip } from '@/components/okrs/inline-status-select';
import { boardStatusChip } from '@/components/okrs/status-chips';
import { BoardStatusSelect } from './board-status-select';
import { formatMilestoneDate, isMilestoneOverdue, summarizeMilestones, todayISO } from './board-progress';
import type { BoardOverview } from '@/hooks/use-board-progress';
import { formatRelative } from '@/lib/utils/dates';
import type { Board } from '@/types';

interface MonitoredBoardCardProps {
  slug: string;
  board: Board;
  overview: BoardOverview | undefined;
  canEdit: boolean;
  onStatusChanged: () => void;
}

const COL_TITLE = { margin: '0 0 0.6rem', fontSize: '1.1rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#919eab' } as const;
const MUTED = { fontSize: '1.2rem', color: '#919eab' } as const;

/**
 * One row of the /tableros "Proyectos monitoreados" stack: name + project
 * status + task roll-up, then a glance at the latest update, the next
 * milestone and the most recent task activity. The whole card opens the
 * board; inner controls stop propagation.
 */
export function MonitoredBoardCard({ slug, board, overview, canEdit, onStatusChanged }: MonitoredBoardCardProps) {
  const [hover, setHover] = useState(false);
  const href = `/${slug}/tableros/${board.id}`;
  const stats = overview?.tasks;
  const latest = overview?.latestUpdate ?? null;
  const ms = summarizeMilestones(overview?.milestones ?? [], todayISO());
  const activity = overview?.activity ?? [];

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: 'white',
        border: hover ? '1px solid #5c6ac4' : '1px solid #dfe3e8',
        borderLeft: `4px solid ${board.color}`,
        borderRadius: '10px',
        padding: '1.6rem 2rem',
        boxShadow: hover ? '0 4px 14px rgba(33,43,54,0.08)' : 'none',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
        <Link href={href} style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', textDecoration: 'none' }}>
          {board.name}
        </Link>
        <BoardStatusSelect boardId={board.id} status={board.status} canEdit={canEdit} onChanged={onStatusChanged} />
        <span style={{ flex: 1 }} />
        {stats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1.2rem', color: '#637381', whiteSpace: 'nowrap' }}>
            <span>
              <strong style={{ color: '#212b36' }}>{stats.completed}</strong>/{stats.total} tareas
            </span>
            {stats.overdue > 0 && <span style={{ color: '#bf0711' }}>{stats.overdue} vencidas</span>}
            {stats.blocked > 0 && <span style={{ color: '#50248f' }}>{stats.blocked} bloqueadas</span>}
            <span aria-hidden style={{ width: 80, height: 6, borderRadius: 3, backgroundColor: '#f1f2f4', overflow: 'hidden', display: 'inline-block' }}>
              <span style={{ display: 'block', width: `${stats.pct}%`, height: '100%', backgroundColor: stats.pct >= 100 ? '#108043' : '#5c6ac4' }} />
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.pct}%</span>
          </div>
        )}
      </div>
      {board.description && <p style={{ margin: '0.4rem 0 0', fontSize: '1.3rem', color: '#637381' }}>{board.description}</p>}

      {/* Glance columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.6rem', marginTop: '1.4rem', paddingTop: '1.4rem', borderTop: '1px solid #f1f2f4' }}>
        <div style={{ minWidth: 0 }}>
          <p style={COL_TITLE}>Último avance</p>
          {latest ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                {latest.author && <UserAvatar user={latest.author} size="small" />}
                <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#212b36' }}>{latest.author?.full_name ?? 'Usuario'}</span>
                <span style={MUTED}>{formatRelative(latest.created_at)}</span>
                {latest.status && <StaticChip chip={boardStatusChip(latest.status)} />}
              </div>
              <p style={{ margin: 0, fontSize: '1.3rem', color: '#212b36', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{latest.content}</p>
            </div>
          ) : (
            <p style={{ margin: 0, ...MUTED, fontSize: '1.3rem' }}>
              Sin avances aún.{' '}
              <Link href={`${href}?tab=avances`} style={{ color: '#5c6ac4', textDecoration: 'none' }}>
                Escribir el primero
              </Link>
            </p>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <p style={COL_TITLE}>Próximo hito</p>
          {ms.next ? (
            <div style={{ fontSize: '1.3rem', color: '#212b36' }}>
              <div style={{ fontWeight: 500 }}>{ms.next.title}</div>
              <div style={{ fontSize: '1.2rem', color: isMilestoneOverdue(ms.next) ? '#bf0711' : '#637381', marginTop: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>
                {formatMilestoneDate(ms.next.due_date)}
                {isMilestoneOverdue(ms.next) && ' · vencido'}
              </div>
              <div style={{ ...MUTED, marginTop: '0.4rem' }}>
                {ms.done} de {ms.total} hitos cumplidos
              </div>
            </div>
          ) : ms.total > 0 ? (
            <p style={{ margin: 0, fontSize: '1.3rem', color: '#108043' }}>Todos los hitos cumplidos ({ms.total})</p>
          ) : (
            <p style={{ margin: 0, ...MUTED, fontSize: '1.3rem' }}>
              Sin hitos.{' '}
              <Link href={`${href}?tab=avances`} style={{ color: '#5c6ac4', textDecoration: 'none' }}>
                Agregar
              </Link>
            </p>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <p style={COL_TITLE}>Actividad reciente</p>
          {activity.length === 0 ? (
            <p style={{ margin: 0, ...MUTED, fontSize: '1.3rem' }}>Sin movimientos en las tareas.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {activity.slice(0, 3).map((g) => (
                <li key={g.taskId} style={{ display: 'flex', gap: '0.6rem', fontSize: '1.2rem', color: '#212b36', lineHeight: 1.4 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: g.headline.dot, marginTop: '0.45rem', flexShrink: 0 }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    <span style={{ fontWeight: 600 }}>{g.headline.actor?.full_name?.split(' ')[0] ?? 'Alguien'}</span> {g.headline.body} <span style={{ color: '#637381' }}>“{g.taskTitle}”</span>
                    <span style={MUTED}>
                      {' · '}
                      {formatRelative(g.headline.created_at)}
                      {g.others.length > 0 && ` · +${g.others.length}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
        <Link href={`${href}?tab=avances`} style={{ fontSize: '1.2rem', fontWeight: 600, color: '#5c6ac4', textDecoration: 'none' }}>
          Ver avances e hitos →
        </Link>
      </div>
    </article>
  );
}
