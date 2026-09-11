import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxEntry } from './outbox';

// In-memory stand-in for the IndexedDB store.
const mem = new Map<string, OutboxEntry>();
vi.mock('./outbox-db', () => ({
  enqueue: async (e: OutboxEntry) => {
    mem.set(e.id, e);
  },
  list: async () => Array.from(mem.values()).sort((a, b) => a.createdAt - b.createdAt),
  remove: async (id: string) => {
    mem.delete(id);
  },
  count: async () => mem.size,
  clear: async () => mem.clear(),
}));

// sync.ts imports the Supabase browser client for the default auth provider;
// tests inject their own provider so the real client is never built.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));

import { replayOutbox } from './sync';
import { useOfflineStore } from '@/stores/offline-store';

const AUTH = async () => ({ apikey: 'anon', Authorization: 'Bearer live-token' });

function seed(id: string, createdAt: number, over: Partial<OutboxEntry> = {}): OutboxEntry {
  const e: OutboxEntry = {
    id,
    createdAt,
    url: `https://abc.supabase.co/rest/v1/tasks?id=eq.${id}`,
    method: 'PATCH',
    headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
    body: '{"priority":"high"}',
    label: 'PATCH tasks',
    ...over,
  };
  mem.set(id, e);
  return e;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  mem.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', { onLine: true });
  useOfflineStore.setState({ pendingCount: 0, syncing: false, failures: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('replayOutbox', () => {
  it('replays oldest first with fresh auth headers and removes on success', async () => {
    seed('b', 2);
    seed('a', 1);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await replayOutbox(AUTH);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(firstUrl).toContain('id=eq.a');
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe('{"priority":"high"}');
    expect(headers['Authorization']).toBe('Bearer live-token');
    expect(headers['apikey']).toBe('anon');
    expect(headers['prefer']).toBe('return=minimal');
    expect(headers['x-kublau-outbox-id']).toBe('a');
    expect(mem.size).toBe(0);
    const s = useOfflineStore.getState();
    expect(s.pendingCount).toBe(0);
    expect(s.syncing).toBe(false);
    expect(s.failures).toEqual([]);
  });

  it('stops on a network error and keeps the remaining entries', async () => {
    seed('a', 1);
    seed('b', 2);
    seed('c', 3);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await replayOutbox(AUTH);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Array.from(mem.keys()).sort()).toEqual(['b', 'c']);
    expect(useOfflineStore.getState().pendingCount).toBe(2);
    expect(useOfflineStore.getState().syncing).toBe(false);
  });

  it('moves 4xx responses to failures and continues', async () => {
    seed('a', 1);
    seed('b', 2);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'new row violates row-level security policy' }), {
          status: 403,
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await replayOutbox(AUTH);

    expect(mem.size).toBe(0);
    const { failures, pendingCount } = useOfflineStore.getState();
    expect(pendingCount).toBe(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.id).toBe('a');
    expect(failures[0]?.label).toBe('PATCH tasks');
    expect(failures[0]?.error).toBe('403 new row violates row-level security policy');
  });

  it('treats 401 and 5xx as transient: keeps entries, no failure', async () => {
    seed('a', 1);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await replayOutbox(AUTH);
    expect(mem.size).toBe(1);

    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await replayOutbox(AUTH);
    expect(mem.size).toBe(1);
    expect(useOfflineStore.getState().failures).toEqual([]);
  });

  it('keeps everything when no session token is available', async () => {
    seed('a', 1);
    await replayOutbox(async () => {
      throw new Error('refresh failed');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mem.size).toBe(1);
    expect(useOfflineStore.getState().syncing).toBe(false);
  });

  it('does nothing while offline', async () => {
    seed('a', 1);
    vi.stubGlobal('navigator', { onLine: false });
    await replayOutbox(AUTH);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mem.size).toBe(1);
    expect(useOfflineStore.getState().pendingCount).toBe(1);
  });

  it('shares a single in-flight replay across concurrent calls', async () => {
    seed('a', 1);
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    const p1 = replayOutbox(AUTH);
    const p2 = replayOutbox(AUTH);
    expect(p1).toBe(p2);
    // `run` awaits list() + auth before the first fetch; wait for it.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(new Response(null, { status: 204 }));
    await p1;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mem.size).toBe(0);
  });
});
