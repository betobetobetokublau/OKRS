'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { createBoard, fetchBoardMembers, syncBoardMembers, updateBoard } from '@/hooks/use-boards';
import { AnimatedModal } from '@/components/common/animated-modal';
import { UserAvatar } from '@/components/common/user-avatar';
import { INPUT_STYLE, TEXTAREA_STYLE } from '@/lib/styles/form';
import type { Board, BoardVisibility, Profile } from '@/types';

export const BOARD_PALETTE = ['#5c6ac4', '#306DF6', '#47c1bf', '#50b83c', '#eec200', '#f49342', '#de3618', '#9c6ade'];

interface BoardFormModalProps {
  open: boolean;
  workspaceId: string;
  /** Workspace members offered in the checklist. */
  members: Profile[];
  /** Present in edit mode ("Configuración del tablero"). */
  board?: Board | null;
  onClose: () => void;
  onSaved: (board: Board) => void;
  onArchived?: () => void;
}

const LABEL = { display: 'block', fontSize: '1.3rem', fontWeight: 600, color: '#212b36', marginBottom: '0.6rem' } as const;
const BTN_SECONDARY = { padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 500, color: '#637381', backgroundColor: '#f4f6f8', border: 'none', borderRadius: '4px', cursor: 'pointer' } as const;

/**
 * Create + edit form for a board: name, description, colour, access and the
 * member checklist. Saving writes `boards` and syncs `board_members` so the
 * list matches the checked set exactly (the current user is always included).
 */
export function BoardFormModal({ open, workspaceId, members, board, onClose, onSaved, onArchived }: BoardFormModalProps) {
  const { profile } = useWorkspaceStore();
  const isEdit = Boolean(board);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(BOARD_PALETTE[0]!);
  const [visibility, setVisibility] = useState<BoardVisibility>('workspace');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // (Re)hydrate whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setQuery('');
    setConfirmArchive(false);
    setName(board?.name ?? '');
    setDescription(board?.description ?? '');
    setColor(board?.color ?? BOARD_PALETTE[0]!);
    setVisibility(board?.visibility ?? 'workspace');
    const base = new Set<string>(profile ? [profile.id] : []);
    setSelected(base);
    if (!board) return;
    let cancelled = false;
    fetchBoardMembers(board.id).then((list) => {
      if (cancelled) return;
      setSelected(new Set([...Array.from(base), ...list.map((p) => p.id)]));
    });
    return () => {
      cancelled = true;
    };
  }, [open, board, profile]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? members.filter((m) => m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) : members;
    // Checked first so the chosen team is visible at a glance.
    return [...list].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.full_name.localeCompare(b.full_name, 'es'));
  }, [members, query, selected]);

  function toggleMember(id: string) {
    if (id === profile?.id) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    const patch = {
      name: name.trim(),
      description: description.trim() || null,
      color,
      visibility,
      owner_id: visibility === 'private' ? profile?.id ?? null : null,
    };
    let saved: Board | null = null;
    if (board) {
      const { error: err } = await updateBoard(board.id, patch);
      if (err) {
        setSaving(false);
        setError('No pudimos guardar los cambios. Intenta de nuevo.');
        return;
      }
      saved = { ...board, ...patch };
    } else {
      saved = await createBoard({ workspace_id: workspaceId, ...patch });
      if (!saved) {
        setSaving(false);
        setError('No pudimos crear el tablero. Intenta de nuevo.');
        return;
      }
    }
    const { error: memErr } = await syncBoardMembers(saved.id, Array.from(selected));
    setSaving(false);
    if (memErr) {
      setError(`El tablero se guardó, pero no pudimos actualizar los miembros: ${memErr}`);
      return;
    }
    onSaved(saved);
  }

  async function handleArchive() {
    if (!board || saving) return;
    setSaving(true);
    const { error: err } = await updateBoard(board.id, { archived_at: new Date().toISOString() });
    setSaving(false);
    if (err) {
      setError('No pudimos archivar el tablero.');
      return;
    }
    onArchived?.();
  }

  return (
    <AnimatedModal open={open} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 600, color: '#212b36', marginBottom: '1.6rem' }}>{isEdit ? 'Configuración del tablero' : 'Nuevo tablero'}</h2>

        <div style={{ marginBottom: '1.4rem' }}>
          <label htmlFor="board-name" style={LABEL}>
            Nombre
          </label>
          <input id="board-name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Roadmap Q4" style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: '1.4rem' }}>
          <label htmlFor="board-desc" style={LABEL}>
            Descripción <span style={{ color: '#919eab', fontWeight: 400 }}>(opcional)</span>
          </label>
          <textarea id="board-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} style={TEXTAREA_STYLE} />
        </div>

        <div style={{ marginBottom: '1.4rem' }}>
          <span style={LABEL}>Color</span>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            {BOARD_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: c, border: color === c ? '3px solid #212b36' : '3px solid white', boxShadow: '0 0 0 1px #dfe3e8', cursor: 'pointer', padding: 0 }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1.4rem' }}>
          <span style={LABEL}>Acceso</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '1.3rem', color: '#212b36' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input type="radio" name="visibility" checked={visibility === 'workspace'} onChange={() => setVisibility('workspace')} />
              Público — todo el workspace
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
              Privado — solo miembros
            </label>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', marginBottom: '0.6rem' }}>
            <span style={{ ...LABEL, marginBottom: 0 }}>Miembros</span>
            <span style={{ fontSize: '1.2rem', color: '#919eab' }}>{selected.size} seleccionados</span>
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar persona" aria-label="Buscar miembros" style={{ ...INPUT_STYLE, fontSize: '1.3rem', padding: '0.6rem 1rem', marginBottom: '0.6rem' }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #dfe3e8', borderRadius: '6px' }}>
            {filtered.map((m) => {
              const checked = selected.has(m.id);
              const isMe = m.id === profile?.id;
              return (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem', cursor: isMe ? 'default' : 'pointer', backgroundColor: checked ? '#f9fafb' : 'white', borderBottom: '1px solid #f1f3f5' }}>
                  <input type="checkbox" checked={checked} disabled={isMe} onChange={() => toggleMember(m.id)} />
                  <UserAvatar user={m} size="small" />
                  <span style={{ flex: 1, fontSize: '1.3rem', color: '#212b36', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name}</span>
                  {isMe && <span style={{ fontSize: '1.1rem', color: '#919eab' }}>Tú</span>}
                </label>
              );
            })}
            {filtered.length === 0 && <p style={{ margin: 0, padding: '1rem', fontSize: '1.2rem', color: '#919eab' }}>Sin resultados</p>}
          </div>
        </div>

        {error && <p style={{ color: '#bf0711', fontSize: '1.3rem', marginBottom: '1.2rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          {isEdit && onArchived && (
            confirmArchive ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.2rem', color: '#637381' }}>
                ¿Archivar?
                <button type="button" onClick={handleArchive} disabled={saving} style={{ ...BTN_SECONDARY, padding: '0.5rem 1rem', fontSize: '1.2rem', color: 'white', backgroundColor: '#bf0711' }}>
                  Sí, archivar
                </button>
                <button type="button" onClick={() => setConfirmArchive(false)} style={{ ...BTN_SECONDARY, padding: '0.5rem 1rem', fontSize: '1.2rem' }}>
                  No
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmArchive(true)} style={{ border: 'none', background: 'none', color: '#bf0711', fontSize: '1.3rem', fontWeight: 500, cursor: 'pointer', padding: 0 }}>
                Archivar tablero
              </button>
            )
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={BTN_SECONDARY}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{ padding: '0.8rem 1.6rem', fontSize: '1.4rem', fontWeight: 600, color: 'white', backgroundColor: saving || !name.trim() ? '#9ea6dc' : '#5c6ac4', border: 'none', borderRadius: '4px', cursor: saving || !name.trim() ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear tablero'}
          </button>
        </div>
      </form>
    </AnimatedModal>
  );
}
