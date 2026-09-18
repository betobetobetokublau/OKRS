import { describe, it, expect } from 'vitest';
import { formatMilestoneDate, isMilestoneOverdue, sortMilestones, summarizeMilestones, taskStats, todayISO } from './board-progress';
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
