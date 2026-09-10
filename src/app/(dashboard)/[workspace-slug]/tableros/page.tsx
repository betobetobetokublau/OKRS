'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useBoards, fetchWorkspaceMembers, updateBoard } from '@/hooks/use-boards';
import { BoardFormModal } from '@/components/boards/board-form-modal';
import { canManageContent } from '@/lib/utils/permissions';
import type { Board, Profile } from '@/types';

export default function TablerosPage() {
  const params = useParams<{ 'workspace-slug': string }>();
  const slug = params?.['workspace-slug'] ?? '';
  const router = useRouter();
  const { currentWorkspace, userWorkspace } = useWorkspaceStore();
  const { boards, loading, refetch } = useBoards(currentWorkspace?.id);
  const [showCreate, setShowCreate] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const canCreate = Boolean(userWorkspace && canManageContent(userWorkspace.role));

  useEffect(() => {
    if (!currentWorkspace?.id || !canCreate) return;
    let cancelled = false;
    fetchWorkspaceMembers(currentWorkspace.id).then((list) => {
      if (!cancelled) setMembers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id, canCreate]);

  // Favorites first (the query already orders this way; re-sort so a star toggle re-orders instantly after refetch).
  const sorted = [...boards].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'));

  async function toggleFavorite(board: Board) {
    await updateBoard(board.id, { is_favorite: !board.is_favorite });
    refetch();
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.6rem', marginBottom: '2.4rem' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 600, color: '#212b36', margin: 0 }}>Tableros</h1>
          <p style={{ fontSize: '1.4rem', color: '#637381', margin: '0.4rem 0 0' }}>
            Organiza el trabajo del equipo en columnas. Una tarea puede vivir en varios tableros sin afectar sus OKRs.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: '#5c6ac4', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Nuevo tablero
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#637381', textAlign: 'center', padding: '4rem' }}>Cargando tableros...</p>
      ) : sorted.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', borderRadius: '8px', border: '1px dashed #c4cdd5', backgroundColor: 'white' }}>
          <p style={{ color: '#637381', fontSize: '1.4rem', margin: 0 }}>Aún no hay tableros.</p>
          {canCreate && (
            <button type="button" onClick={() => setShowCreate(true)} style={{ marginTop: '1.2rem', border: 'none', background: 'none', color: '#5c6ac4', fontSize: '1.4rem', fontWeight: 600, cursor: 'pointer' }}>
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.6rem' }}>
          {sorted.map((b) => (
            <BoardCardTile key={b.id} board={b} onOpen={() => router.push(`/${slug}/tableros/${b.id}`)} onToggleFavorite={() => toggleFavorite(b)} />
          ))}
        </div>
      )}

      {currentWorkspace && (
        <BoardFormModal
          open={showCreate}
          workspaceId={currentWorkspace.id}
          members={members}
          onClose={() => setShowCreate(false)}
          onSaved={(board) => {
            setShowCreate(false);
            refetch();
            router.push(`/${slug}/tableros/${board.id}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function BoardCardTile({ board, onOpen, onToggleFavorite }: { board: Board; onOpen: () => void; onToggleFavorite: () => void }) {
  const [hover, setHover] = useState(false);
  const count = board.task_count ?? 0;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: 'white',
        border: hover ? '1px solid #5c6ac4' : '1px solid #dfe3e8',
        borderRadius: '10px',
        padding: '1.6rem',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        minHeight: '120px',
        boxShadow: hover ? '0 4px 14px rgba(33,43,54,0.08)' : 'none',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ width: 14, height: 14, minWidth: 14, borderRadius: '50%', backgroundColor: board.color }} />
        <span style={{ flex: 1, fontSize: '1.6rem', fontWeight: 600, color: '#212b36', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</span>
        <button
          type="button"
          aria-label={board.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          aria-pressed={board.is_favorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={{ border: 'none', background: 'none', fontSize: '1.8rem', lineHeight: 1, color: board.is_favorite ? '#eec200' : '#c4cdd5', cursor: 'pointer', padding: '0 0.2rem' }}
        >
          {board.is_favorite ? '★' : '☆'}
        </button>
      </div>
      {board.description && (
        <p style={{ margin: 0, fontSize: '1.3rem', color: '#637381', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{board.description}</p>
      )}
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '1.2rem', color: '#919eab' }}>
        <span>
          {count} {count === 1 ? 'tarea' : 'tareas'}
        </span>
        <span>·</span>
        <span>{board.visibility === 'private' ? 'Privado' : 'Todo el workspace'}</span>
      </div>
    </div>
  );
}
