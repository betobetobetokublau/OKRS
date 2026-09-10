'use client';

import Link from 'next/link';
import { BoardMembers } from './board-members';
import type { BoardTab } from './board-filters';
import type { Board, Profile } from '@/types';

interface BoardHeaderProps {
  slug: string;
  board: Board;
  taskCount: number;
  overdueCount: number;
  boardMembers: Profile[];
  /** Present when the viewer can open "Configuración del tablero". */
  onOpenSettings?: () => void;
  tab: BoardTab;
  onTabChange: (tab: BoardTab) => void;
}

/** Back link + title row + subtitle (with stacked member avatars) + tabs. */
export function BoardHeader({ slug, board, taskCount, overdueCount, boardMembers, onOpenSettings, tab, onTabChange }: BoardHeaderProps) {
  return (
    <>
      <Link href={`/${slug}/tableros`} style={{ color: '#637381', fontSize: '1.2rem', textDecoration: 'none' }}>
        ← Tableros
      </Link>

      <div style={{ margin: '0.8rem 0 1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: board.color, display: 'inline-block' }} />
          <h1 style={{ fontSize: '2.2rem', fontWeight: 600, color: '#212b36', margin: 0 }}>{board.name}</h1>
          <span style={{ fontSize: '1.3rem', color: '#637381' }}>
            · {taskCount} {taskCount === 1 ? 'tarea' : 'tareas'} ·{' '}
            <span style={{ color: overdueCount > 0 ? '#bf0711' : '#637381' }}>
              {overdueCount} {overdueCount === 1 ? 'vencida' : 'vencidas'}
            </span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: '1.3rem', color: '#637381' }}>
            {board.visibility === 'private' ? 'Tablero privado · solo miembros' : 'Tablero del equipo · visible para todo el workspace'}
            {board.description ? ` · ${board.description}` : ''}
          </p>
          <BoardMembers members={boardMembers} onClick={onOpenSettings} />
        </div>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid #dfe3e8', marginBottom: '1.6rem' }}>
        <TabButton active={tab === 'board'} onClick={() => onTabChange('board')}>
          Tablero
        </TabButton>
        <TabButton active={tab === 'list'} onClick={() => onTabChange('list')}>
          Lista
        </TabButton>
        <TabButton disabled>Calendario</TabButton>
      </div>
    </>
  );
}

function TabButton({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={Boolean(active)}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Próximamente' : undefined}
      style={{
        padding: '0.8rem 1.6rem',
        fontSize: '1.4rem',
        fontWeight: active ? 600 : 500,
        color: active ? '#5c6ac4' : disabled ? '#c4cdd5' : '#637381',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #5c6ac4' : '2px solid transparent',
        marginBottom: '-1px',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
