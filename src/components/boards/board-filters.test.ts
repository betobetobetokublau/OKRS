import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  countActiveFilters,
  groupItems,
  sortItems,
  EMPTY_FILTERS,
  UNASSIGNED_KEY,
  UNSECTIONED_KEY,
} from './board-filters';
import type { BoardSection, BoardTask, Profile, Task } from '@/types';

const ME = 'user-me';
const OTHER = 'user-other';

function profile(id: string, full_name: string): Profile {
  return { id, email: `${id}@x.com`, full_name, avatar_url: null, must_change_password: false, onboarded_at: null } as Profile;
}

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    workspace_id: 'ws',
    objective_id: 'obj-1',
    parent_task_id: null,
    title: overrides.id,
    description: null,
    status: 'pending',
    priority: null,
    block_reason: null,
    assigned_user_id: null,
    due_date: null,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function item(position: number, sectionId: string | null, t: Task): BoardTask {
  return { board_id: 'b', task_id: t.id, section_id: sectionId, position, added_by: null, created_at: '2026-01-01', task: t };
}

const sections: BoardSection[] = [
  { id: 's2', board_id: 'b', name: 'En curso', position: 1, wip_limit: null, created_at: '' },
  { id: 's1', board_id: 'b', name: 'Por hacer', position: 0, wip_limit: null, created_at: '' },
];

const ana = profile(ME, 'Ana Zeta');
const beto = profile(OTHER, 'Beto Alfa');

const items: BoardTask[] = [
  item(2, 's1', task({ id: 'c', title: 'Cerrar', status: 'completed', priority: 'low', assigned_user_id: ME, due_date: '2020-01-01' })),
  item(0, 's1', task({ id: 'a', title: 'Abrir', status: 'pending', priority: 'high', assigned_user_id: OTHER, due_date: '2999-01-01', assigned_user: beto })),
  item(1, 's2', task({ id: 'b', title: 'Bloquear', status: 'blocked', priority: null, assigned_user_id: ME, due_date: '2020-06-01', objective_id: null, assigned_user: ana })),
  item(3, null, task({ id: 'd', title: 'Dormir', status: 'in_progress', priority: 'medium', assigned_user_id: null })),
];

describe('applyFilters', () => {
  it('returns everything with empty filters', () => {
    expect(applyFilters(items, EMPTY_FILTERS, ME)).toHaveLength(4);
  });

  it('incomplete drops completed tasks', () => {
    const out = applyFilters(items, { ...EMPTY_FILTERS, quick: ['incomplete'] }, ME);
    expect(out.map((i) => i.task_id)).not.toContain('c');
    expect(out).toHaveLength(3);
  });

  it('mine keeps only tasks assigned to the current user', () => {
    const out = applyFilters(items, { ...EMPTY_FILTERS, quick: ['mine'] }, ME);
    expect(out.map((i) => i.task_id).sort()).toEqual(['b', 'c']);
    expect(applyFilters(items, { ...EMPTY_FILTERS, quick: ['mine'] }, null)).toHaveLength(0);
  });

  it('overdue ignores completed tasks with past due dates', () => {
    const out = applyFilters(items, { ...EMPTY_FILTERS, quick: ['overdue'] }, ME);
    expect(out.map((i) => i.task_id)).toEqual(['b']);
  });

  it('no_objective and blocked', () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, quick: ['no_objective'] }, ME).map((i) => i.task_id)).toEqual(['b']);
    expect(applyFilters(items, { ...EMPTY_FILTERS, quick: ['blocked'] }, ME).map((i) => i.task_id)).toEqual(['b']);
  });

  it('status and priority builders are OR within, AND across', () => {
    const out = applyFilters(items, { ...EMPTY_FILTERS, statuses: ['pending', 'in_progress'], priorities: ['medium', 'none'] }, ME);
    expect(out.map((i) => i.task_id)).toEqual(['d']);
    const none = applyFilters(items, { ...EMPTY_FILTERS, priorities: ['none'] }, ME);
    expect(none.map((i) => i.task_id)).toEqual(['b']);
  });

  it('assignee pill filters but is not counted as an active filter', () => {
    const filters = { ...EMPTY_FILTERS, assignee: OTHER };
    expect(applyFilters(items, filters, ME).map((i) => i.task_id)).toEqual(['a']);
    expect(countActiveFilters(filters)).toBe(0);
    expect(countActiveFilters({ ...filters, quick: ['mine'], statuses: ['blocked'], priorities: ['high', 'low'] })).toBe(4);
  });
});

describe('sortItems', () => {
  const ids = (arr: BoardTask[]) => arr.map((i) => i.task_id);

  it('manual keeps position order and does not mutate input', () => {
    const copy = [...items];
    expect(ids(sortItems(items, 'manual'))).toEqual(['a', 'b', 'c', 'd']);
    expect(items).toEqual(copy);
  });

  it('priority: high → medium → low → none', () => {
    expect(ids(sortItems(items, 'priority'))).toEqual(['a', 'd', 'c', 'b']);
  });

  it('due_date ascending with nulls last', () => {
    expect(ids(sortItems(items, 'due_date'))).toEqual(['c', 'b', 'a', 'd']);
  });

  it('status: pending, in_progress, blocked, completed', () => {
    expect(ids(sortItems(items, 'status'))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('assignee by name with unassigned last', () => {
    // 'c' has assigned_user_id but no embedded profile → treated as nameless (last, tie by position).
    expect(ids(sortItems(items, 'assignee'))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('alpha by title', () => {
    expect(ids(sortItems(items, 'alpha'))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('groupItems', () => {
  it('section grouping follows section position and adds "Sin sección" only when needed', () => {
    const cols = groupItems(items, 'section', sections, [ana, beto]);
    expect(cols.map((c) => c.title)).toEqual(['Por hacer', 'En curso', 'Sin sección']);
    expect(cols[0]?.items.map((i) => i.task_id)).toEqual(['c', 'a']);
    expect(cols[2]?.key).toBe(UNSECTIONED_KEY);

    const noLoose = groupItems(items.filter((i) => i.section_id), 'section', sections, []);
    expect(noLoose.map((c) => c.title)).toEqual(['Por hacer', 'En curso']);
  });

  it('items in an unknown section fall into "Sin sección"', () => {
    const cols = groupItems([item(0, 'ghost', task({ id: 'z' }))], 'section', sections, []);
    expect(cols.at(-1)?.key).toBe(UNSECTIONED_KEY);
    expect(cols.at(-1)?.items).toHaveLength(1);
  });

  it('status grouping always yields the four columns', () => {
    const cols = groupItems(items, 'status', sections, []);
    expect(cols.map((c) => c.status)).toEqual(['pending', 'in_progress', 'blocked', 'completed']);
    expect(cols[3]?.items.map((i) => i.task_id)).toEqual(['c']);
    expect(groupItems([], 'status', sections, [])).toHaveLength(4);
  });

  it('assignee grouping lists members alphabetically, then "Sin responsable"', () => {
    const cols = groupItems(items, 'assignee', sections, [ana, beto]);
    expect(cols.map((c) => c.title)).toEqual(['Ana Zeta', 'Beto Alfa', 'Sin responsable']);
    expect(cols[0]?.assigneeId).toBe(ME);
    expect(cols[2]?.key).toBe(UNASSIGNED_KEY);
    expect(cols[2]?.items.map((i) => i.task_id)).toEqual(['d']);
  });
});
