export interface StatusChip {
  label: string;
  bg: string;
  fg: string;
  dot: string;
}

export function kpiStatusFromProgress(progress: number): StatusChip {
  if (progress >= 100) return { label: 'Logrado', bg: '#e3f1df', fg: '#108043', dot: '#108043' };
  if (progress >= 70) return { label: 'On track', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
  if (progress >= 40) return { label: 'En progreso', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
  return { label: 'Off track', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
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
      return { label: 'On track', bg: '#e3f1df', fg: '#108043', dot: '#50b83c' };
    case 'at_risk':
      return { label: 'En riesgo', bg: '#fcf1cd', fg: '#8a6116', dot: '#eec200' };
    case 'off_track':
      return { label: 'Off track', bg: '#fbeae5', fg: '#bf0711', dot: '#de3618' };
    default:
      return { label: status, bg: '#e4e5e7', fg: '#454f5b', dot: '#919eab' };
  }
}

export const KPI_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_track', label: 'On track' },
  { value: 'at_risk', label: 'En riesgo' },
  { value: 'off_track', label: 'Off track' },
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
