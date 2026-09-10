import type { TaskPriority } from '@/types';

export interface PriorityChip {
  label: string;
  bg: string;
  fg: string;
  /** Unicode glyph used as the chip's leading marker (▲ ▬ ▼). */
  glyph: string;
}

/** Colour vocabulary matches status-chips.ts (Polaris red / yellow / green). */
export const PRIORITY_CHIPS: Record<TaskPriority, PriorityChip> = {
  high: { label: 'Alta', bg: '#fbeae5', fg: '#bf0711', glyph: '▲' },
  medium: { label: 'Media', bg: '#fcf1cd', fg: '#8a6116', glyph: '▬' },
  low: { label: 'Baja', bg: '#e3f1df', fg: '#108043', glyph: '▼' },
};

export const PRIORITY_OPTIONS: Array<{ value: TaskPriority | ''; label: string }> = [
  { value: '', label: '— Sin prioridad —' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baja' },
];

/** Sort weight: high first, unset last. */
export function priorityRank(p: TaskPriority | null | undefined): number {
  switch (p) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    case 'low':
      return 2;
    default:
      return 3;
  }
}
