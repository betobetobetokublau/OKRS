import { describe, it, expect } from 'vitest';
import { unwrapRelation, pluck } from './supabase-helpers';

describe('unwrapRelation', () => {
  it('returns [] for null or undefined input', () => {
    expect(unwrapRelation<{ id: string }>(null, 'profile')).toEqual([]);
    expect(unwrapRelation<{ id: string }>(undefined, 'profile')).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(unwrapRelation<{ id: string }>([], 'profile')).toEqual([]);
  });

  it('extracts a single-object relation from each row', () => {
    const rows = [
      { profile: { id: 'p1', name: 'A' } },
      { profile: { id: 'p2', name: 'B' } },
    ];
    expect(unwrapRelation<{ id: string; name: string }>(rows, 'profile')).toEqual([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]);
  });

  it('drops rows where the relation is null', () => {
    const rows = [
      { profile: { id: 'p1' } },
      { profile: null },
      { profile: { id: 'p2' } },
    ];
    expect(unwrapRelation<{ id: string }>(rows, 'profile')).toEqual([
      { id: 'p1' },
      { id: 'p2' },
    ]);
  });

  it('takes the first element when the relation is an array', () => {
    const rows = [
      { profile: [{ id: 'p1' }, { id: 'p1-extra' }] },
      { profile: [] },
      { profile: [{ id: 'p2' }] },
    ];
    expect(unwrapRelation<{ id: string }>(rows, 'profile')).toEqual([
      { id: 'p1' },
      { id: 'p2' },
    ]);
  });
});

describe('pluck', () => {
  it('returns [] for null', () => {
    expect(pluck<string>(null, 'id')).toEqual([]);
  });

  it('extracts a scalar column from each row', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pluck<string>(rows, 'id')).toEqual(['a', 'b', 'c']);
  });

  it('drops null/undefined values', () => {
    const rows = [{ id: 'a' }, { id: null }, { id: undefined }, { id: 'b' }];
    expect(pluck<string>(rows, 'id')).toEqual(['a', 'b']);
  });

  it('preserves number values', () => {
    const rows = [{ n: 0 }, { n: 1 }, { n: 2 }];
    expect(pluck<number>(rows, 'n')).toEqual([0, 1, 2]);
  });
});
