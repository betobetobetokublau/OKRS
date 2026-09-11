import { describe, it, expect } from 'vitest';
import { workspaceRoutes } from './warm-routes';

describe('workspaceRoutes', () => {
  it('lists the daily sections plus one entry per board', () => {
    const r = workspaceRoutes('kublau', ['b1', 'b2']);
    expect(r).toContain('/kublau');
    expect(r).toContain('/kublau/check-in');
    expect(r).toContain('/kublau/tableros');
    expect(r).toContain('/kublau/tableros/b1');
    expect(r).toContain('/kublau/tableros/b2');
    expect(r.filter((x) => x.startsWith('/kublau/tableros/'))).toHaveLength(2);
  });
  it('works with no boards', () => {
    expect(workspaceRoutes('ws', []).every((x) => x.startsWith('/ws'))).toBe(true);
  });
});
