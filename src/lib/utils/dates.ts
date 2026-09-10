import { format, formatDistanceToNow, isBefore, startOfMonth, endOfMonth, differenceInDays, differenceInCalendarDays, differenceInCalendarMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * ISO strings go through `parseISO` so date-only values (`2026-09-08`, the
 * shape of every `date` column) are local midnight instead of UTC midnight —
 * `new Date('2026-09-08')` renders as 07 sep west of Greenwich.
 */
function toDate(date: string | Date): Date {
  return typeof date === 'string' ? parseISO(date) : date;
}

export function formatDate(date: string | Date): string {
  return format(toDate(date), 'dd MMM yyyy', { locale: es });
}

export function formatDateTime(date: string | Date): string {
  return format(toDate(date), "dd MMM yyyy 'a las' HH:mm", { locale: es });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(toDate(date), { addSuffix: true, locale: es });
}

export function formatMonthYear(date: string | Date): string {
  return format(toDate(date), 'MMMM yyyy', { locale: es });
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return isBefore(new Date(dueDate), new Date());
}

export function daysUntil(date: string | Date): number {
  return differenceInDays(new Date(date), new Date());
}

/**
 * Whole local calendar days elapsed since `iso` (a `date` column value like
 * `2026-05-19`, or a full ISO timestamp). 0 = due today, negative = future.
 * Date-only strings are parsed as local midnight so the day never shifts
 * with the timezone.
 */
export function daysOverdue(iso: string, now: Date = new Date()): number {
  return differenceInCalendarDays(now, parseISO(iso));
}

/** Calendar-day overdue test: due day strictly before today (local). */
export function isPastDue(iso: string | null, now: Date = new Date()): boolean {
  return iso != null && daysOverdue(iso, now) > 0;
}

/**
 * Short Spanish label for how long ago a due date passed, in local calendar
 * days: "hoy", "ayer", "antier", "hace N días", and from 60 days on
 * "hace N meses". Future dates fall back to the formatted date.
 */
export function formatOverdue(iso: string, now: Date = new Date()): string {
  const days = daysOverdue(iso, now);
  if (days < 0) return formatDate(iso);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days === 2) return 'antier';
  if (days < 60) return `hace ${days} días`;
  const months = Math.max(2, differenceInCalendarMonths(now, parseISO(iso)));
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export function isInCurrentMonth(date: string | Date): boolean {
  const d = new Date(date);
  const now = new Date();
  return d >= startOfMonth(now) && d <= endOfMonth(now);
}

export function getCurrentMonthStart(): Date {
  return startOfMonth(new Date());
}
