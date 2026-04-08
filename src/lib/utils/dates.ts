import { format, formatDistanceToNow, isBefore, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy', { locale: es });
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy 'a las' HH:mm", { locale: es });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
}

export function formatMonthYear(date: string | Date): string {
  return format(new Date(date), 'MMMM yyyy', { locale: es });
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return isBefore(new Date(dueDate), new Date());
}

export function daysUntil(date: string | Date): number {
  return differenceInDays(new Date(date), new Date());
}

export function isInCurrentMonth(date: string | Date): boolean {
  const d = new Date(date);
  const now = new Date();
  return d >= startOfMonth(now) && d <= endOfMonth(now);
}

export function getCurrentMonthStart(): Date {
  return startOfMonth(new Date());
}
