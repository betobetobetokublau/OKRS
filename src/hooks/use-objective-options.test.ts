import { describe, it, expect } from 'vitest';
import { groupObjectivesByDepartment } from './use-objective-options';
import type { Department, Objective } from '@/types';

const dept = (id: string, name: string): Department => ({
  id,
  workspace_id: 'ws',
  name,
  color: '#000',
  created_at: '',
});
const obj = (id: string, title: string, dep: string | null): Objective => ({
  id,
  period_id: 'p',
  workspace_id: 'ws',
  title,
  description: null,
  status: 'in_progress',
  progress_mode: 'manual',
  manual_progress: 0,
  responsible_user_id: null,
  responsible_department_id: dep,
  start_date: null,
  end_date: null,
  created_at: '',
  updated_at: '',
});

describe('groupObjectivesByDepartment', () => {
  const depts = [dept('d2', 'Ventas'), dept('d1', 'Dev')];
  it('groups by responsible department, sorted by department and title', () => {
    const g = groupObjectivesByDepartment(
      [obj('o2', 'Zeta', 'd1'), obj('o1', 'Alfa', 'd1'), obj('o3', 'Beta', 'd2')],
      depts,
      [],
    );
    expect(g.map((x) => x.department?.name)).toEqual(['Dev', 'Ventas']);
    expect(g[0]!.objectives.map((o) => o.title)).toEqual(['Alfa', 'Zeta']);
  });
  it('places an objective under every linked department too', () => {
    const g = groupObjectivesByDepartment([obj('o1', 'Alfa', 'd1')], depts, [
      { objective_id: 'o1', department_id: 'd2' },
    ]);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.objectives[0]?.id === 'o1')).toBe(true);
  });
  it('puts objectives without department in a trailing null group', () => {
    const g = groupObjectivesByDepartment([obj('o1', 'Solo', null), obj('o2', 'Dev', 'd1')], depts, []);
    expect(g.at(-1)?.department).toBeNull();
    expect(g.at(-1)?.objectives[0]?.title).toBe('Solo');
  });
  it('skips departments with no objectives', () => {
    const g = groupObjectivesByDepartment([obj('o1', 'A', 'd1')], depts, []);
    expect(g.map((x) => x.department?.id)).toEqual(['d1']);
  });
});
