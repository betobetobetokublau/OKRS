import type { BoardMilestone, Task } from '@/types';
import { isPastDue } from '@/lib/utils/dates';

/**
 * Pure helpers for monitored boards ("proyectos"): milestone summaries and
 * task roll-ups shown on the /tableros project cards and the Avances tab.
 * No I/O here so everything is unit-testable.
 */

/** Local calendar day as `YYYY-MM-DD` (never UTC: evenings in Mexico must not roll to tomorrow). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isMilestoneOverdue(m: Pick<BoardMilestone, 'done' | 'due_date'>, today: string = todayISO()): boolean {
  return !m.done && m.due_date < today;
}

export interface MilestoneSummary {
  total: number;
  done: number;
  overdue: number;
  /** Earliest pending milestone (overdue ones first, since they are the most urgent). */
  next: BoardMilestone | null;
}

export function summarizeMilestones(milestones: BoardMilestone[], today: string = todayISO()): MilestoneSummary {
  const pending = milestones.filter((m) => !m.done).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return {
    total: milestones.length,
    done: milestones.filter((m) => m.done).length,
    overdue: pending.filter((m) => m.due_date < today).length,
    next: pending[0] ?? null,
  };
}

/** Pending first by date ascending, then done ones with the most recent on top. */
export function sortMilestones(milestones: BoardMilestone[]): BoardMilestone[] {
  const pending = milestones.filter((m) => !m.done).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const done = milestones.filter((m) => m.done).sort((a, b) => b.due_date.localeCompare(a.due_date));
  return [...pending, ...done];
}

export interface TaskStats {
  total: number;
  completed: number;
  overdue: number;
  blocked: number;
  /** 0–100, completed over total; 0 when the board is empty. */
  pct: number;
}

export function taskStats(tasks: Array<Pick<Task, 'status' | 'due_date'>>, now: Date = new Date()): TaskStats {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const overdue = tasks.filter((t) => t.status !== 'completed' && isPastDue(t.due_date, now)).length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  return { total, completed, overdue, blocked, pct: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

/** `DD mes` for milestone dates without a timezone shift (`YYYY-MM-DD` parsed by parts). */
export function formatMilestoneDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = months[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month} ${m[1]}`;
}
