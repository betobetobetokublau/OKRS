import { describe, it, expect } from 'vitest';
import { activityDot, activityWeight, formatMilestoneDate, groupActivityByTask, isMilestoneOverdue, sortMilestones, summarizeMilestones, taskStats, todayISO } from './board-progress';
import type { BoardMilestone } from '@/types';

function ms(partial: Partial<BoardMilestone> & Pick<BoardMilestone, 'id' | 'due_date'>): BoardMilestone {
  return {
    board_id: 'b',
    workspace_id: 'w',
    title: partial.id,
    done: false,
    done_at: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

const TODAY = '2026-09-18';

describe('todayISO', () => {
  it('uses the local calendar day, not UTC', () => {
    // 23:30 local on the 18th must stay the 18th.
    expect(todayISO(new Date(2026, 8, 18, 23, 30))).toBe('2026-09-18');
  });
});

describe('summarizeMilestones', () => {
  it('counts done / overdue and picks the earliest pending as next', () => {
    const list = [
      ms({ id: 'late', due_date: '2026-09-01' }),
      ms({ id: 'soon', due_date: '2026-09-25' }),
      ms({ id: 'past-done', due_date: '2026-08-01', done: true }),
    ];
    const s = summarizeMilestones(list, TODAY);
    expect(s.total).toBe(3);
    expect(s.done).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.next?.id).toBe('late');
  });
  it('returns null next when everything is done', () => {
    expect(summarizeMilestones([ms({ id: 'a', due_date: '2026-01-01', done: true })], TODAY).next).toBeNull();
  });
  it('handles an empty list', () => {
    expect(summarizeMilestones([], TODAY)).toEqual({ total: 0, done: 0, overdue: 0, next: null });
  });
});

describe('sortMilestones', () => {
  it('puts pending first by date and done last, newest done first', () => {
    const list = [
      ms({ id: 'd-old', due_date: '2026-01-01', done: true }),
      ms({ id: 'p2', due_date: '2026-10-01' }),
      ms({ id: 'd-new', due_date: '2026-06-01', done: true }),
      ms({ id: 'p1', due_date: '2026-09-01' }),
    ];
    expect(sortMilestones(list).map((m) => m.id)).toEqual(['p1', 'p2', 'd-new', 'd-old']);
  });
});

describe('isMilestoneOverdue', () => {
  it('is overdue only when pending and strictly before today', () => {
    expect(isMilestoneOverdue({ done: false, due_date: '2026-09-17' }, TODAY)).toBe(true);
    expect(isMilestoneOverdue({ done: false, due_date: '2026-09-18' }, TODAY)).toBe(false);
    expect(isMilestoneOverdue({ done: true, due_date: '2026-09-01' }, TODAY)).toBe(false);
  });
});

describe('taskStats', () => {
  const now = new Date(2026, 8, 18, 12);
  it('rolls up totals, completion percentage, overdue and blocked', () => {
    const s = taskStats(
      [
        { status: 'completed', due_date: '2026-09-01' },
        { status: 'pending', due_date: '2026-09-01' },
        { status: 'blocked', due_date: null },
        { status: 'in_progress', due_date: '2026-12-01' },
      ],
      now,
    );
    expect(s).toEqual({ total: 4, completed: 1, overdue: 1, blocked: 1, pct: 25 });
  });
  it('is all zeros for an empty board', () => {
    expect(taskStats([], now)).toEqual({ total: 0, completed: 0, overdue: 0, blocked: 0, pct: 0 });
  });
});

describe('formatMilestoneDate', () => {
  it('formats YYYY-MM-DD without shifting the day', () => {
    expect(formatMilestoneDate('2026-10-03')).toBe('3 oct 2026');
  });
});


describe('activityWeight', () => {
  it('ranks completion, blocking, creation, comments and assignment as high', () => {
    expect(activityWeight('status', { to: 'completed' })).toBe('high');
    expect(activityWeight('status', { to: 'blocked' })).toBe('high');
    expect(activityWeight('created')).toBe('high');
    expect(activityWeight('comment')).toBe('high');
    expect(activityWeight('assignee', { to: 'u1' })).toBe('high');
  });
  it('treats ordinary status moves, dates and subtasks as medium', () => {
    expect(activityWeight('status', { to: 'in_progress' })).toBe('medium');
    expect(activityWeight('due_date', { to: '2026-10-01' })).toBe('medium');
    expect(activityWeight('subtask_added')).toBe('medium');
  });
  it('hides column moves, board placement, renames and priority', () => {
    for (const k of ['section', 'board_added', 'board_removed', 'title', 'priority', 'unknown']) expect(activityWeight(k)).toBe('low');
  });
});

describe('groupActivityByTask', () => {
  const ev = (id: string, taskId: string, at: string, weight: 'high' | 'medium' | 'low') => ({ id, taskId, taskTitle: `T${taskId}`, created_at: at, weight });
  it('drops low events, groups per task with newest as headline and keeps headline order', () => {
    const groups = groupActivityByTask(
      [
        ev('a', '1', '2026-09-18T10:00:00Z', 'high'),
        ev('b', '1', '2026-09-18T09:00:00Z', 'medium'),
        ev('c', '1', '2026-09-18T08:30:00Z', 'low'),
        ev('d', '2', '2026-09-18T09:30:00Z', 'medium'),
        ev('e', '1', '2026-09-18T08:00:00Z', 'high'),
      ],
      5,
    );
    expect(groups.map((g) => g.taskId)).toEqual(['1', '2']);
    expect(groups[0]?.headline.id).toBe('a');
    expect(groups[0]?.others.map((o) => o.id)).toEqual(['b', 'e']);
    expect(groups[1]?.others).toEqual([]);
  });
  it('caps the number of groups', () => {
    const list = ['1', '2', '3'].map((t, i) => ev(t, t, `2026-09-18T0${i}:00:00Z`, 'high' as const));
    expect(groupActivityByTask(list, 2)).toHaveLength(2);
  });
});

describe('activityDot', () => {
  it('colours completion green, blocking purple, comments blue', () => {
    expect(activityDot('status', { to: 'completed' })).toBe('#108043');
    expect(activityDot('status', { to: 'blocked' })).toBe('#9c6ade');
    expect(activityDot('comment')).toBe('#006fbb');
  });
});
