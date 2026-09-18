import type { BoardStatus } from '@/types';

export interface StatusChip {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

export function kpiStatusFromProgress(progress: number): StatusChip {
  if (progress >= 100) return { label: 'Logrado', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
  if (progress >= 70) return { label: 'En curso', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
  if (progress >= 40) return { label: 'En progreso', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
  return { label: 'Fuera de curso', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
}

export function objectiveStatusChip(status: string): StatusChip {
  switch (status) {
    case 'in_progress':
      return { label: 'En progreso', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'paused':
      return { label: 'En pausa', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
    case 'deprecated':
      return { label: 'Deprecado', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    case 'upcoming':
      return { label: 'Próximo', bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

export function taskStatusChip(status: string): StatusChip {
  switch (status) {
    case 'completed':
      return { label: 'Completada', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
    case 'in_progress':
      return { label: 'En progreso', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'pending':
      return { label: 'Pendiente', bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
    case 'blocked':
      return { label: 'Bloqueada', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

export function kpiStatusChip(status: string): StatusChip {
  switch (status) {
    case 'achieved':
      return { label: 'Logrado', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
    case 'on_track':
      return { label: 'En curso', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'at_risk':
      return { label: 'En riesgo', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
    case 'off_track':
      return { label: 'Fuera de curso', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

/** Monitored-board (project) health. Same vocabulary for `boards.status` and `board_updates.status`. */
export function boardStatusChip(status: string): StatusChip {
  switch (status) {
    case 'on_time':
      return { label: 'En tiempo', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'at_risk':
      return { label: 'En riesgo', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
    case 'off_track':
      return { label: 'Fuera de curso', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    case 'blocked':
      return { label: 'Bloqueado', bg: '#f3ecfb', fg: '#50248f', dot: '#9c6ade' };
    case 'paused':
      return { label: 'Pausado', bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
    case 'completed':
      return { label: 'Completado', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
    case 'dropped':
      return { label: 'Descartado', bg: '#e4e5e7', fg: '#637381', dot: '#637381' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

export const BOARD_STATUS_OPTIONS: Array<{ value: BoardStatus; label: string }> = [
  { value: 'on_time', label: 'En tiempo' },
  { value: 'at_risk', label: 'En riesgo' },
  { value: 'off_track', label: 'Fuera de curso' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'paused', label: 'Pausado' },
  { value: 'completed', label: 'Completado' },
  { value: 'dropped', label: 'Descartado' },
];

export const KPI_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_track', label: 'En curso' },
  { value: 'at_risk', label: 'En riesgo' },
  { value: 'off_track', label: 'Fuera de curso' },
  { value: 'achieved', label: 'Logrado' },
];

export const OBJECTIVE_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'upcoming', label: 'Próximo' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'paused', label: 'En pausa' },
  { value: 'deprecated', label: 'Deprecado' },
];

export const TASK_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'completed', label: 'Completada' },
  { value: 'blocked', label: 'Bloqueada' },
];
