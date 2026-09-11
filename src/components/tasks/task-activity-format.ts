import type { TaskActivity } from '@/types';

/**
 * Pure formatter for the "Actividad" tab of a task. Turns one `task_activity`
 * row (filled by DB triggers) into a Spanish sentence such as
 * "Alberto cambió la prioridad Media → Alta".
 *
 * `lookupName` resolves a profile id (assignee from/to) to a display name;
 * it should return null when unknown so we can fall back gracefully.
 * `lookupTaskTitle` does the same for task ids (`parent` re-parenting rows).
 */

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  blocked: 'Bloqueada',
};

export const PRIORITY_LABELS: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const MONTHS_ES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export type NameLookup = (id: string) => string | null | undefined;

type ActivityLike = Pick<TaskActivity, 'kind' | 'payload'> & {
  actor?: { full_name: string } | null;
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function statusLabel(value: unknown): string {
  const s = str(value);
  if (!s) return 'Sin estado';
  return STATUS_LABELS[s] ?? s;
}

export function priorityLabel(value: unknown): string {
  const s = str(value);
  if (!s) return 'Sin prioridad';
  return PRIORITY_LABELS[s] ?? s;
}

function dateLabel(value: unknown): string {
  const s = str(value);
  if (!s) return 'sin fecha';
  // Dates arrive as `YYYY-MM-DD`; avoid timezone shifts by parsing parts.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthName = MONTHS_ES_SHORT[month - 1];
  if (!monthName || !Number.isFinite(day)) return s;
  return `${day} ${monthName} ${year}`;
}

function personLabel(id: unknown, lookupName: NameLookup): string | null {
  const s = str(id);
  if (!s) return null;
  return lookupName(s) ?? 'un usuario';
}

/**
 * Returns the sentence WITHOUT the actor name (e.g. "cambió la prioridad
 * Media → Alta"). Callers prepend the actor for rendering.
 */
export function formatActivityBody(
  activity: ActivityLike,
  lookupName: NameLookup,
  lookupTaskTitle: NameLookup = () => null,
): string {
  const p = activity.payload ?? {};
  switch (activity.kind) {
    case 'created':
      return 'creó la tarea';
    case 'status': {
      const base = `cambió el estado ${statusLabel(p.from)} → ${statusLabel(p.to)}`;
      const reason = str(p.block_reason);
      return p.to === 'blocked' && reason ? `${base} (motivo: ${reason})` : base;
    }
    case 'priority':
      return `cambió la prioridad ${priorityLabel(p.from)} → ${priorityLabel(p.to)}`;
    case 'assignee': {
      const to = personLabel(p.to, lookupName);
      if (to) return `asignó la tarea a ${to}`;
      const from = personLabel(p.from, lookupName);
      return from ? `quitó la asignación de ${from}` : 'quitó la asignación';
    }
    case 'due_date': {
      if (!str(p.to)) return 'quitó la fecha límite';
      if (!str(p.from)) return `fijó la fecha límite para el ${dateLabel(p.to)}`;
      return `cambió la fecha límite ${dateLabel(p.from)} → ${dateLabel(p.to)}`;
    }
    case 'objective': {
      const toTitle = str(p.to_title);
      if (!str(p.to)) return 'desvinculó la tarea de su objetivo';
      return toTitle ? `vinculó la tarea al objetivo “${toTitle}”` : 'vinculó la tarea a otro objetivo';
    }
    case 'title': {
      const to = str(p.to);
      return to ? `renombró la tarea a “${to}”` : 'renombró la tarea';
    }
    case 'board_added': {
      const board = str(p.board) ?? 'un tablero';
      const section = str(p.section);
      return section ? `agregó la tarea al tablero ${board} › ${section}` : `agregó la tarea al tablero ${board}`;
    }
    case 'board_removed': {
      const board = str(p.board) ?? 'un tablero';
      return `quitó la tarea del tablero ${board}`;
    }
    case 'section': {
      const board = str(p.board) ?? 'el tablero';
      const from = str(p.from) ?? 'Sin sección';
      const to = str(p.to) ?? 'Sin sección';
      return `movió la tarea de ${from} a ${to} en ${board}`;
    }
    case 'subtask_added': {
      const title = str(p.title);
      return title ? `agregó la subtarea “${title}”` : 'agregó una subtarea';
    }
    case 'parent': {
      const to = str(p.to);
      if (!to) return 'convirtió la tarea en independiente';
      const title = lookupTaskTitle(to);
      return title ? `movió la tarea bajo “${title}”` : 'movió la tarea bajo otra tarea';
    }
    default:
      return 'actualizó la tarea';
  }
}

/** Full sentence including the actor ("Alberto cambió la prioridad Media → Alta"). */
export function formatActivity(activity: ActivityLike, lookupName: NameLookup, lookupTaskTitle?: NameLookup): string {
  const actor = activity.actor?.full_name ?? 'Alguien';
  return `${actor} ${formatActivityBody(activity, lookupName, lookupTaskTitle)}`;
}
