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

// ---------------------------------------------------------------------------
// Activity feed: signal weighting + grouping per task
// ---------------------------------------------------------------------------

export type ActivityWeight = 'high' | 'medium' | 'low';

/**
 * How much a `task_activity` row deserves attention on a project card.
 * `low` rows (column moves, board add/remove, renames, priority) are hidden.
 */
export function activityWeight(kind: string, payload: Record<string, unknown> = {}): ActivityWeight {
  switch (kind) {
    case 'created':
    case 'comment':
    case 'assignee':
      return 'high';
    case 'status':
      return payload.to === 'completed' || payload.to === 'blocked' ? 'high' : 'medium';
    case 'due_date':
    case 'subtask_added':
    case 'objective':
    case 'parent':
      return 'medium';
    default:
      return 'low';
  }
}

/** Dot colour for the headline of a group, by the event kind (+ status target). */
export function activityDot(kind: string, payload: Record<string, unknown> = {}): string {
  if (kind === 'status' && payload.to === 'completed') return '#108043';
  if (kind === 'status' && payload.to === 'blocked') return '#9c6ade';
  if (kind === 'comment') return '#006fbb';
  if (kind === 'created') return '#5c6ac4';
  if (kind === 'assignee') return '#f49342';
  return '#919eab';
}

export interface ActivityGroup<T> {
  taskId: string;
  taskTitle: string;
  /** Most recent visible event on that task. */
  headline: T;
  /** Older events on the same task, newest first. */
  others: T[];
}

/**
 * Collapses a newest-first event list into one group per task (headline =
 * newest event, the rest folded under "+N cambios más"). `low` weight events
 * are dropped first. Groups keep the order of their headline.
 */
export function groupActivityByTask<T extends { taskId: string; taskTitle: string; created_at: string; weight: ActivityWeight }>(
  events: T[],
  maxGroups: number,
): ActivityGroup<T>[] {
  const visible = [...events].filter((e) => e.weight !== 'low').sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const groups = new Map<string, ActivityGroup<T>>();
  for (const e of visible) {
    const g = groups.get(e.taskId);
    if (g) g.others.push(e);
    else groups.set(e.taskId, { taskId: e.taskId, taskTitle: e.taskTitle, headline: e, others: [] });
  }
  return Array.from(groups.values()).slice(0, maxGroups);
}
