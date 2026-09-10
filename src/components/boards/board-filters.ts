import type { BoardSection, BoardTask, Profile, TaskPriority, TaskStatus } from '@/types';
import { priorityRank } from '@/components/tasks/priority';
import { isOverdue } from '@/lib/utils/dates';

/**
 * Pure filter / sort / group helpers for the Tableros Kanban. No React, no
 * Supabase — everything here is unit-tested in `board-filters.test.ts`.
 */

export type QuickFilter = 'incomplete' | 'mine' | 'overdue' | 'no_objective' | 'blocked';
/** 'none' matches tasks without a priority. */
export type PriorityFilter = TaskPriority | 'none';

export interface BoardFilters {
  quick: QuickFilter[];
  statuses: TaskStatus[];
  priorities: PriorityFilter[];
  /** 'all' or a profile id. Driven by the separate "Asignado" pill, so it is NOT counted in `countActiveFilters`. */
  assignee: string;
}

export type BoardSort = 'manual' | 'priority' | 'due_date' | 'status' | 'assignee' | 'alpha';
export type BoardGrouping = 'section' | 'status' | 'assignee';
export type BoardTab = 'board' | 'list';

export interface BoardView {
  filters: BoardFilters;
  sort: BoardSort;
  grouping: BoardGrouping;
  tab: BoardTab;
}

export const EMPTY_FILTERS: BoardFilters = { quick: [], statuses: [], priorities: [], assignee: 'all' };
export const DEFAULT_VIEW: BoardView = { filters: EMPTY_FILTERS, sort: 'manual', grouping: 'section', tab: 'board' };

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  incomplete: 'Incompletas',
  mine: 'Solo mías',
  overdue: 'Vencidas',
  no_objective: 'Sin objetivo',
  blocked: 'Bloqueadas',
};

export const SORT_OPTIONS: Array<{ value: BoardSort; label: string }> = [
  { value: 'manual', label: 'Posición manual' },
  { value: 'priority', label: 'Prioridad' },
  { value: 'due_date', label: 'Fecha límite' },
  { value: 'status', label: 'Estado' },
  { value: 'assignee', label: 'Responsable' },
  { value: 'alpha', label: 'Alfabético' },
];

export const GROUPING_OPTIONS: Array<{ value: BoardGrouping; label: string }> = [
  { value: 'section', label: 'Sección' },
  { value: 'status', label: 'Estado' },
  { value: 'assignee', label: 'Responsable' },
];

const STATUS_ORDER: TaskStatus[] = ['pending', 'in_progress', 'blocked', 'completed'];
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  blocked: 'Bloqueada',
  completed: 'Completada',
};

export const UNSECTIONED_KEY = 'section:none';
export const UNASSIGNED_KEY = 'assignee:none';

/** Number of filters the "Filtros: N" button should display. */
export function countActiveFilters(filters: BoardFilters): number {
  return filters.quick.length + filters.statuses.length + filters.priorities.length;
}

export function isTaskOverdue(item: BoardTask): boolean {
  const t = item.task;
  if (!t) return false;
  return t.status !== 'completed' && isOverdue(t.due_date);
}

export function applyFilters(items: BoardTask[], filters: BoardFilters, currentUserId: string | null | undefined): BoardTask[] {
  return items.filter((item) => {
    const t = item.task;
    if (!t) return false;
    if (filters.assignee !== 'all' && t.assigned_user_id !== filters.assignee) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(t.status)) return false;
    if (filters.priorities.length > 0) {
      const p: PriorityFilter = t.priority ?? 'none';
      if (!filters.priorities.includes(p)) return false;
    }
    for (const q of filters.quick) {
      switch (q) {
        case 'incomplete':
          if (t.status === 'completed') return false;
          break;
        case 'mine':
          if (!currentUserId || t.assigned_user_id !== currentUserId) return false;
          break;
        case 'overdue':
          if (!isTaskOverdue(item)) return false;
          break;
        case 'no_objective':
          if (t.objective_id) return false;
          break;
        case 'blocked':
          if (t.status !== 'blocked') return false;
          break;
      }
    }
    return true;
  });
}

function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
  // Nulls last.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function assigneeName(item: BoardTask): string | null {
  return item.task?.assigned_user?.full_name ?? null;
}

export function sortItems(items: BoardTask[], sort: BoardSort): BoardTask[] {
  const arr = [...items];
  const byPosition = (a: BoardTask, b: BoardTask) => a.position - b.position;
  switch (sort) {
    case 'manual':
      return arr.sort(byPosition);
    case 'priority':
      return arr.sort(
        (a, b) => priorityRank(a.task?.priority) - priorityRank(b.task?.priority) || byPosition(a, b),
      );
    case 'due_date':
      return arr.sort((a, b) => compareNullableString(a.task?.due_date, b.task?.due_date) || byPosition(a, b));
    case 'status':
      return arr.sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.task?.status ?? 'pending') - STATUS_ORDER.indexOf(b.task?.status ?? 'pending') ||
          byPosition(a, b),
      );
    case 'assignee':
      return arr.sort(
        (a, b) => compareNullableString(assigneeName(a)?.toLowerCase(), assigneeName(b)?.toLowerCase()) || byPosition(a, b),
      );
    case 'alpha':
      return arr.sort((a, b) => (a.task?.title ?? '').localeCompare(b.task?.title ?? '', 'es') || byPosition(a, b));
  }
}

/**
 * Applies a per-user column order to the board's sections. Ids in `saved`
 * come first (in that order, skipping ids that no longer exist); sections not
 * mentioned (new ones) are appended in `position` order. Returns a new array
 * whose `position` values are renumbered so `groupItems` reflects the order.
 */
export function applyColumnOrder(sections: BoardSection[], saved: string[] | undefined): BoardSection[] {
  const byPosition = [...sections].sort((a, b) => a.position - b.position);
  if (!saved || saved.length === 0) return byPosition;
  const byId = new Map(byPosition.map((s) => [s.id, s]));
  const ordered: BoardSection[] = [];
  for (const id of saved) {
    const s = byId.get(id);
    if (s) {
      ordered.push(s);
      byId.delete(id);
    }
  }
  for (const s of byPosition) if (byId.has(s.id)) ordered.push(s);
  return ordered.map((s, i) => (s.position === i ? s : { ...s, position: i }));
}

export interface BoardColumn {
  /** Stable id used as the dnd-kit droppable id. */
  key: string;
  title: string;
  kind: BoardGrouping;
  /** Present for `kind === 'section'`; null = "Sin sección". */
  sectionId?: string | null;
  /** Present for `kind === 'status'`. */
  status?: TaskStatus;
  /** Present for `kind === 'assignee'`; null = "Sin responsable". */
  assigneeId?: string | null;
  items: BoardTask[];
}

/**
 * Buckets already-sorted items into columns. Order inside a column is preserved.
 * - section: every section in `position` order, plus a trailing "Sin sección"
 *   column only when some item has `section_id = null`.
 * - status: the four statuses, always present (so cards can be dropped anywhere).
 * - assignee: members that have at least one card (alphabetical), plus
 *   "Sin responsable" when some item is unassigned.
 */
export function groupItems(
  items: BoardTask[],
  grouping: BoardGrouping,
  sections: BoardSection[],
  members: Profile[],
): BoardColumn[] {
  if (grouping === 'section') {
    const ordered = [...sections].sort((a, b) => a.position - b.position);
    const known = new Set(ordered.map((s) => s.id));
    const cols: BoardColumn[] = ordered.map((s) => ({
      key: `section:${s.id}`,
      title: s.name,
      kind: 'section',
      sectionId: s.id,
      items: items.filter((it) => it.section_id === s.id),
    }));
    // Items pointing at a deleted/unknown section behave as unsectioned.
    const loose = items.filter((it) => !it.section_id || !known.has(it.section_id));
    if (loose.length > 0) {
      cols.push({ key: UNSECTIONED_KEY, title: 'Sin sección', kind: 'section', sectionId: null, items: loose });
    }
    return cols;
  }

  if (grouping === 'status') {
    return STATUS_ORDER.map((status) => ({
      key: `status:${status}`,
      title: STATUS_LABEL[status],
      kind: 'status',
      status,
      items: items.filter((it) => it.task?.status === status),
    }));
  }

  // assignee
  const byMember = new Map<string, BoardTask[]>();
  const unassigned: BoardTask[] = [];
  for (const it of items) {
    const uid = it.task?.assigned_user_id;
    if (!uid) {
      unassigned.push(it);
      continue;
    }
    const arr = byMember.get(uid) ?? [];
    arr.push(it);
    byMember.set(uid, arr);
  }
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.full_name ??
    byMember.get(id)?.find((it) => it.task?.assigned_user)?.task?.assigned_user?.full_name ??
    'Sin nombre';
  const cols: BoardColumn[] = Array.from(byMember.keys())
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es'))
    .map((id) => ({
      key: `assignee:${id}`,
      title: nameOf(id),
      kind: 'assignee',
      assigneeId: id,
      items: byMember.get(id) ?? [],
    }));
  if (unassigned.length > 0) {
    cols.push({ key: UNASSIGNED_KEY, title: 'Sin responsable', kind: 'assignee', assigneeId: null, items: unassigned });
  }
  return cols;
}

// ---------------------------------------------------------------------------
// Per-board view persistence (localStorage). Safe to call server-side / in tests.
// ---------------------------------------------------------------------------
export function viewStorageKey(boardId: string): string {
  return `kublau:board:${boardId}:view`;
}

const SORT_VALUES = new Set<string>(SORT_OPTIONS.map((o) => o.value));
const GROUPING_VALUES = new Set<string>(GROUPING_OPTIONS.map((o) => o.value));

export function loadView(boardId: string): BoardView {
  try {
    if (typeof window === 'undefined') return DEFAULT_VIEW;
    const raw = window.localStorage.getItem(viewStorageKey(boardId));
    if (!raw) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw) as Partial<BoardView>;
    const f: Partial<BoardFilters> = parsed.filters ?? {};
    return {
      filters: {
        quick: Array.isArray(f.quick) ? f.quick : [],
        statuses: Array.isArray(f.statuses) ? f.statuses : [],
        priorities: Array.isArray(f.priorities) ? f.priorities : [],
        assignee: typeof f.assignee === 'string' ? f.assignee : 'all',
      },
      sort: parsed.sort && SORT_VALUES.has(parsed.sort) ? parsed.sort : 'manual',
      grouping: parsed.grouping && GROUPING_VALUES.has(parsed.grouping) ? parsed.grouping : 'section',
      tab: parsed.tab === 'list' ? 'list' : 'board',
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(boardId: string, view: BoardView): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(viewStorageKey(boardId), JSON.stringify(view));
  } catch {
    // Storage may be full or disabled; the view simply won't persist.
  }
}
