import { describe, it, expect } from 'vitest';
import { boardSchema, boardSectionSchema, extractMentionIds } from './board';
import { taskSchema } from './task';

const WS = '11111111-1111-4111-8111-111111111111';
const U1 = '22222222-2222-4222-8222-222222222222';
const U2 = '33333333-3333-4333-8333-333333333333';

describe('boardSchema', () => {
  it('accepts a minimal board and applies defaults', () => {
    const r = boardSchema.parse({ name: 'Sprint 24', workspace_id: WS });
    expect(r.color).toBe('#5c6ac4');
    expect(r.visibility).toBe('workspace');
  });
  it('rejects empty names and bad colors', () => {
    expect(boardSchema.safeParse({ name: '   ', workspace_id: WS }).success).toBe(false);
    expect(boardSchema.safeParse({ name: 'X', color: 'red', workspace_id: WS }).success).toBe(false);
  });
  it('rejects unknown visibility', () => {
    expect(boardSchema.safeParse({ name: 'X', visibility: 'public', workspace_id: WS }).success).toBe(false);
  });
});

describe('boardSectionSchema', () => {
  it('requires a name and positive wip limit', () => {
    expect(boardSectionSchema.safeParse({ name: 'En curso', wip_limit: 3 }).success).toBe(true);
    expect(boardSectionSchema.safeParse({ name: 'En curso', wip_limit: 0 }).success).toBe(false);
    expect(boardSectionSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('taskSchema (boards era)', () => {
  it('allows tasks without an objective but requires workspace_id', () => {
    expect(taskSchema.safeParse({ title: 'Idea', workspace_id: WS }).success).toBe(true);
    expect(taskSchema.safeParse({ title: 'Idea' }).success).toBe(false);
  });
  it('validates priority values', () => {
    expect(taskSchema.safeParse({ title: 'T', workspace_id: WS, priority: 'high' }).success).toBe(true);
    expect(taskSchema.safeParse({ title: 'T', workspace_id: WS, priority: 'urgent' }).success).toBe(false);
  });
});

describe('extractMentionIds', () => {
  it('extracts unique ids from @[Name](uuid) tokens', () => {
    const text = `Hola @[Ruth](${U1}) y @[Valeria](${U2}) — también @[Ruth](${U1})`;
    expect(extractMentionIds(text)).toEqual([U1, U2]);
  });
  it('ignores plain @ text and malformed tokens', () => {
    expect(extractMentionIds('hola @alberto y @[Foo](nope)')).toEqual([]);
  });
});
