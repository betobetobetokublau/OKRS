import { describe, it, expect } from 'vitest';
import {
  calculateObjectiveProgress,
  calculateKpiProgress,
  getProgressColor,
  getProgressLabel,
} from './progress';
import type { Objective, Task, KPI } from '@/types';

function obj(partial: Partial<Objective>): Objective {
  return {
    id: 'o1',
    period_id: 'p1',
    workspace_id: 'w1',
    title: 't',
    description: null,
    status: 'in_progress',
    progress_mode: 'auto',
    manual_progress: 0,
    responsible_user_id: null,
    responsible_department_id: null,
    start_date: null,
    end_date: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

function task(status: Task['status']): Task {
  return {
    id: Math.random().toString(),
    objective_id: 'o1',
    title: 't',
    description: null,
    status,
    block_reason: null,
    assigned_user_id: null,
    due_date: null,
    created_at: '',
    updated_at: '',
  };
}

function kpi(partial: Partial<KPI>): KPI {
  return {
    id: 'k1',
    period_id: 'p1',
    workspace_id: 'w1',
    title: 'k',
    description: null,
    progress_mode: 'auto',
    manual_progress: 0,
    status: 'on_track',
    responsible_user_id: null,
    responsible_department_id: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('calculateObjectiveProgress', () => {
  it('returns manual value verbatim in manual mode', () => {
    const o = obj({ progress_mode: 'manual', manual_progress: 73 });
    expect(calculateObjectiveProgress(o, [])).toBe(73);
    expect(calculateObjectiveProgress(o, [task('pending'), task('completed')])).toBe(73);
  });

  it('auto mode with 0 tasks returns 0, not NaN', () => {
    const o = obj({ progress_mode: 'auto' });
    expect(calculateObjectiveProgress(o, [])).toBe(0);
  });

  it('auto mode computes completed / total', () => {
    const o = obj({ progress_mode: 'auto' });
    const tasks = [task('completed'), task('completed'), task('pending'), task('blocked')];
    expect(calculateObjectiveProgress(o, tasks)).toBe(50);
  });

  it('auto mode rounds to nearest integer', () => {
    const o = obj({ progress_mode: 'auto' });
    const tasks = [task('completed'), task('pending'), task('pending')];
    expect(calculateObjectiveProgress(o, tasks)).toBe(33);
  });

  it('hybrid averages auto and manual, rounded', () => {
    const o = obj({ progress_mode: 'hybrid', manual_progress: 50 });
    const tasks = [task('completed'), task('completed'), task('pending'), task('pending')];
    expect(calculateObjectiveProgress(o, tasks)).toBe(50);
  });

  it('hybrid with 0 tasks averages 0 and manual', () => {
    const o = obj({ progress_mode: 'hybrid', manual_progress: 80 });
    expect(calculateObjectiveProgress(o, [])).toBe(40);
  });

  it('100% when every task is completed', () => {
    const o = obj({ progress_mode: 'auto' });
    const tasks = [task('completed'), task('completed')];
    expect(calculateObjectiveProgress(o, tasks)).toBe(100);
  });
});

describe('calculateKpiProgress', () => {
  it('returns manual value verbatim in manual mode', () => {
    const k = kpi({ progress_mode: 'manual', manual_progress: 42 });
    expect(calculateKpiProgress(k, [])).toBe(42);
  });

  it('auto mode with 0 linked objectives returns 0', () => {
    const k = kpi({ progress_mode: 'auto' });
    expect(calculateKpiProgress(k, [])).toBe(0);
  });

  it('auto mode averages linked objectives progress', () => {
    const k = kpi({ progress_mode: 'auto' });
    const o1 = obj({ progress_mode: 'manual', manual_progress: 40 });
    const o2 = obj({ progress_mode: 'manual', manual_progress: 80 });
    expect(calculateKpiProgress(k, [{ objective: o1, tasks: [] }, { objective: o2, tasks: [] }])).toBe(60);
  });

  it('hybrid mode averages auto-average with kpi manual', () => {
    const k = kpi({ progress_mode: 'hybrid', manual_progress: 50 });
    const o1 = obj({ progress_mode: 'manual', manual_progress: 100 });
    expect(calculateKpiProgress(k, [{ objective: o1, tasks: [] }])).toBe(75);
  });

  it('auto rolls up task completion through hybrid objectives', () => {
    const k = kpi({ progress_mode: 'auto' });
    const o1 = obj({ progress_mode: 'auto' });
    const tasks1 = [task('completed'), task('pending')];
    expect(calculateKpiProgress(k, [{ objective: o1, tasks: tasks1 }])).toBe(50);
  });
});

describe('getProgressColor', () => {
  it('maps buckets correctly', () => {
    expect(getProgressColor(0)).toBe('#de3618');
    expect(getProgressColor(24)).toBe('#de3618');
    expect(getProgressColor(25)).toBe('#eec200');
    expect(getProgressColor(49)).toBe('#eec200');
    expect(getProgressColor(50)).toBe('#f49342');
    expect(getProgressColor(79)).toBe('#f49342');
    expect(getProgressColor(80)).toBe('#50b83c');
    expect(getProgressColor(100)).toBe('#50b83c');
  });
});

describe('getProgressLabel', () => {
  it('maps buckets correctly', () => {
    expect(getProgressLabel(0)).toBe('Sin avance');
    expect(getProgressLabel(25)).toBe('Inicial');
    expect(getProgressLabel(50)).toBe('En progreso');
    expect(getProgressLabel(80)).toBe('Avanzado');
    expect(getProgressLabel(100)).toBe('Completado');
    expect(getProgressLabel(150)).toBe('Completado');
  });
});
