import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatMonthYear,
  isOverdue,
  daysUntil,
  isInCurrentMonth,
  getCurrentMonthStart,
} from './dates';

describe('dates', () => {
  describe('formatDate', () => {
    it('formats an ISO string as dd MMM yyyy in Spanish', () => {
      expect(formatDate('2026-05-20T10:00:00.000Z')).toMatch(/20 may\.? 2026/);
    });

    it('formats a Date object', () => {
      expect(formatDate(new Date('2026-01-15T12:00:00.000Z'))).toMatch(/15 ene\.? 2026/);
    });
  });

  describe('formatDateTime', () => {
    it('includes the time component', () => {
      const out = formatDateTime('2026-05-20T15:30:00.000Z');
      expect(out).toMatch(/2026/);
      expect(out).toMatch(/a las/);
    });
  });

  describe('formatMonthYear', () => {
    it('formats as month-year in Spanish', () => {
      expect(formatMonthYear('2026-05-20')).toMatch(/mayo 2026/);
    });
  });

  describe('isOverdue', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns false for null', () => {
      expect(isOverdue(null)).toBe(false);
    });

    it('returns true for a past date', () => {
      expect(isOverdue('2026-05-19')).toBe(true);
    });

    it('returns false for a future date', () => {
      expect(isOverdue('2026-12-31')).toBe(false);
    });

    it('returns false for today before now', () => {
      expect(isOverdue('2026-05-20T13:00:00.000Z')).toBe(false);
    });
  });

  describe('daysUntil', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns 0 for today', () => {
      expect(daysUntil('2026-05-20T12:00:00.000Z')).toBe(0);
    });

    it('returns positive for future', () => {
      expect(daysUntil('2026-05-25T12:00:00.000Z')).toBe(5);
    });

    it('returns negative for past', () => {
      expect(daysUntil('2026-05-15T12:00:00.000Z')).toBe(-5);
    });
  });

  describe('isInCurrentMonth', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true for a date in this month', () => {
      expect(isInCurrentMonth('2026-05-02T12:00:00.000Z')).toBe(true);
      expect(isInCurrentMonth('2026-05-30T12:00:00.000Z')).toBe(true);
    });

    it('returns false for last month', () => {
      expect(isInCurrentMonth('2026-04-15T12:00:00.000Z')).toBe(false);
    });

    it('returns false for next month', () => {
      expect(isInCurrentMonth('2026-06-15T12:00:00.000Z')).toBe(false);
    });
  });

  describe('getCurrentMonthStart', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T15:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the first day of the current month at 00:00', () => {
      const d = getCurrentMonthStart();
      expect(d.getDate()).toBe(1);
      expect(d.getMonth()).toBe(4); // May = 4 (0-indexed)
      expect(d.getFullYear()).toBe(2026);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
    });
  });

  describe('formatRelative', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('produces a Spanish relative phrase', () => {
      const out = formatRelative('2026-05-19T12:00:00.000Z');
      expect(out.toLowerCase()).toMatch(/hace|día|días/);
    });
  });
});
