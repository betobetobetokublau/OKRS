import { describe, it, expect } from 'vitest';
import { formatActivity, formatActivityBody } from './task-activity-format';
import type { TaskActivityKind } from '@/types';

const NAMES: Record<string, string> = {
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': 'Valeria',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': 'Ruth',
};
const lookup = (id: string) => NAMES[id] ?? null;

function act(kind: TaskActivityKind, payload: Record<string, unknown>, actor = 'Alberto') {
  return { kind, payload, actor: { full_name: actor } };
}

describe('formatActivity', () => {
  it('prefixes the actor name and falls back to "Alguien"', () => {
    expect(formatActivity(act('created', { title: 'X' }), lookup)).toBe('Alberto creó la tarea');
    expect(formatActivity({ kind: 'created', payload: {}, actor: null }, lookup)).toBe('Alguien creó la tarea');
  });

  it('formats priority changes with Spanish labels and "Sin prioridad" for null', () => {
    expect(formatActivity(act('priority', { from: 'medium', to: 'high' }), lookup)).toBe(
      'Alberto cambió la prioridad Media → Alta',
    );
    expect(formatActivityBody(act('priority', { from: null, to: 'low' }), lookup)).toBe(
      'cambió la prioridad Sin prioridad → Baja',
    );
  });

  it('formats status changes and appends the block reason when blocking', () => {
    expect(formatActivity(act('status', { from: 'pending', to: 'blocked', block_reason: 'Falta insumo' }, 'Ruth'), lookup)).toBe(
      'Ruth cambió el estado Pendiente → Bloqueada (motivo: Falta insumo)',
    );
    expect(formatActivityBody(act('status', { from: 'in_progress', to: 'completed', block_reason: 'stale' }), lookup)).toBe(
      'cambió el estado En progreso → Completada',
    );
  });

  it('resolves assignee ids to names', () => {
    expect(formatActivity(act('assignee', { from: null, to: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }), lookup)).toBe(
      'Alberto asignó la tarea a Valeria',
    );
    expect(formatActivityBody(act('assignee', { from: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', to: null }), lookup)).toBe(
      'quitó la asignación de Ruth',
    );
    expect(formatActivityBody(act('assignee', { from: null, to: 'unknown-id' }), lookup)).toBe(
      'asignó la tarea a un usuario',
    );
  });

  it('formats due date changes without timezone drift', () => {
    expect(formatActivityBody(act('due_date', { from: null, to: '2026-09-30' }), lookup)).toBe(
      'fijó la fecha límite para el 30 sep 2026',
    );
    expect(formatActivityBody(act('due_date', { from: '2026-09-30', to: '2026-10-01' }), lookup)).toBe(
      'cambió la fecha límite 30 sep 2026 → 1 oct 2026',
    );
    expect(formatActivityBody(act('due_date', { from: '2026-09-30', to: null }), lookup)).toBe('quitó la fecha límite');
  });

  it('formats board placement activity', () => {
    expect(formatActivityBody(act('board_added', { board: 'Sprint', section: 'En curso' }), lookup)).toBe(
      'agregó la tarea al tablero Sprint › En curso',
    );
    expect(formatActivityBody(act('board_added', { board: 'Sprint', section: null }), lookup)).toBe(
      'agregó la tarea al tablero Sprint',
    );
    expect(formatActivityBody(act('board_removed', { board: 'Sprint' }), lookup)).toBe('quitó la tarea del tablero Sprint');
    expect(formatActivityBody(act('section', { board: 'Sprint', from: 'Por hacer', to: 'En curso' }), lookup)).toBe(
      'movió la tarea de Por hacer a En curso en Sprint',
    );
    expect(formatActivityBody(act('section', { board: 'Sprint', from: null, to: 'Hecho' }), lookup)).toBe(
      'movió la tarea de Sin sección a Hecho en Sprint',
    );
  });

  it('formats subtasks, titles and objectives', () => {
    expect(formatActivityBody(act('subtask_added', { title: 'Pedir cotización' }), lookup)).toBe(
      'agregó la subtarea “Pedir cotización”',
    );
    expect(formatActivityBody(act('title', { from: 'A', to: 'B' }), lookup)).toBe('renombró la tarea a “B”');
    expect(formatActivityBody(act('objective', { from: 'x', to: null }), lookup)).toBe(
      'desvinculó la tarea de su objetivo',
    );
    expect(formatActivityBody(act('objective', { from: null, to: 'y' }), lookup)).toBe(
      'vinculó la tarea a otro objetivo',
    );
  });

  it('never throws on unknown kinds or empty payloads', () => {
    expect(formatActivityBody({ kind: 'weird' as TaskActivityKind, payload: {} }, lookup)).toBe('actualizó la tarea');
    expect(formatActivityBody({ kind: 'status', payload: {} }, lookup)).toBe('cambió el estado Sin estado → Sin estado');
  });
});
