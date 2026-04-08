import type { Task, Objective, KPI } from '@/types';

export function calculateObjectiveProgress(
  objective: Objective,
  tasks: Task[]
): number {
  if (objective.progress_mode === 'manual') {
    return objective.manual_progress;
  }

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const autoProgress = total === 0 ? 0 : Math.round((completed / total) * 100);

  if (objective.progress_mode === 'auto') {
    return autoProgress;
  }

  // hybrid
  return Math.round((autoProgress + objective.manual_progress) / 2);
}

export function calculateKpiProgress(
  kpi: KPI,
  objectives: Array<{ objective: Objective; tasks: Task[] }>
): number {
  if (kpi.progress_mode === 'manual') {
    return kpi.manual_progress;
  }

  const total = objectives.length;
  if (total === 0) return 0;

  const sumProgress = objectives.reduce(
    (sum, { objective, tasks }) =>
      sum + calculateObjectiveProgress(objective, tasks),
    0
  );
  const autoProgress = Math.round(sumProgress / total);

  if (kpi.progress_mode === 'auto') {
    return autoProgress;
  }

  // hybrid
  return Math.round((autoProgress + kpi.manual_progress) / 2);
}

export function getProgressColor(progress: number): string {
  if (progress >= 80) return '#50b83c';
  if (progress >= 50) return '#f49342';
  if (progress >= 25) return '#eec200';
  return '#de3618';
}

export function getProgressLabel(progress: number): string {
  if (progress >= 100) return 'Completado';
  if (progress >= 80) return 'Avanzado';
  if (progress >= 50) return 'En progreso';
  if (progress >= 25) return 'Inicial';
  return 'Sin avance';
}
