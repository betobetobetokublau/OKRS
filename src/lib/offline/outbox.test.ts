import { describe as suite, expect, it } from 'vitest';
import {
  buildOfflineResponse,
  createEntry,
  describe,
  ensureIds,
  isMutationRequest,
  OFFLINE_RESPONSE_HEADER,
  pickHeaders,
  restTarget,
  shouldQueue,
  type OutboxEntry,
} from './outbox';

const SUPABASE = 'https://abc.supabase.co';
const rest = (path: string) => `${SUPABASE}/rest/v1/${path}`;

function entry(over: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: 'e1',
    createdAt: 1,
    url: rest('tasks'),
    method: 'POST',
    headers: {},
    body: null,
    label: 'POST tasks',
    ...over,
  };
}

suite('isMutationRequest', () => {
  it('accepts POST/PATCH/PUT/DELETE on /rest/v1 tables and rpc', () => {
    expect(isMutationRequest(rest('tasks?id=eq.1'), 'PATCH', SUPABASE)).toBe(true);
    expect(isMutationRequest(rest('tasks'), 'post', SUPABASE)).toBe(true);
    expect(isMutationRequest(rest('tasks?id=eq.1'), 'DELETE', SUPABASE)).toBe(true);
    expect(isMutationRequest(rest('tasks'), 'PUT', SUPABASE)).toBe(true);
    expect(isMutationRequest(rest('rpc/save_checkin'), 'POST', SUPABASE)).toBe(true);
  });

  it('rejects reads', () => {
    expect(isMutationRequest(rest('tasks?select=*'), 'GET', SUPABASE)).toBe(false);
    expect(isMutationRequest(rest('tasks'), 'HEAD', SUPABASE)).toBe(false);
    expect(isMutationRequest(rest('tasks'), undefined, SUPABASE)).toBe(false);
  });

  it('never queues auth, storage or realtime traffic', () => {
    expect(isMutationRequest(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, 'POST', SUPABASE)).toBe(false);
    expect(isMutationRequest(`${SUPABASE}/storage/v1/object/avatars/x.png`, 'POST', SUPABASE)).toBe(false);
    expect(isMutationRequest(`${SUPABASE}/realtime/v1/api/broadcast`, 'POST', SUPABASE)).toBe(false);
  });

  it('rejects other origins and malformed input', () => {
    expect(isMutationRequest('https://evil.example/rest/v1/tasks', 'POST', SUPABASE)).toBe(false);
    expect(isMutationRequest('/rest/v1/tasks', 'POST', SUPABASE)).toBe(false);
    expect(isMutationRequest(rest('tasks'), 'POST', undefined)).toBe(false);
    expect(isMutationRequest(rest('tasks'), 'POST', 'not a url')).toBe(false);
  });
});

suite('describe / restTarget', () => {
  it('labels table mutations', () => {
    expect(describe(rest('tasks?id=eq.1&select=*'), 'patch')).toBe('PATCH tasks');
    expect(describe(rest('comments'), 'POST')).toBe('POST comments');
  });
  it('labels rpc calls with the function name', () => {
    expect(describe(rest('rpc/save_checkin'), 'POST')).toBe('POST rpc/save_checkin');
    expect(restTarget(rest('rpc/save_checkin'))).toBe('rpc/save_checkin');
  });
  it('returns null target for non-rest urls', () => {
    expect(restTarget(`${SUPABASE}/auth/v1/token`)).toBeNull();
    expect(restTarget('garbage')).toBeNull();
  });
});

suite('pickHeaders (whitelist)', () => {
  it('keeps only safe headers, lower-cased, from a Headers instance', () => {
    const h = new Headers({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      Accept: 'application/vnd.pgrst.object+json',
      'Content-Profile': 'public',
      'X-Client-Info': 'supabase-js-web/2.0',
      Authorization: 'Bearer secret',
      apikey: 'anon-key',
      'X-Retry-Count': '1',
    });
    expect(pickHeaders(h)).toEqual({
      'content-type': 'application/json',
      prefer: 'return=representation',
      accept: 'application/vnd.pgrst.object+json',
      'content-profile': 'public',
      'x-client-info': 'supabase-js-web/2.0',
    });
  });
  it('never persists authorization / apikey', () => {
    const picked = pickHeaders({ Authorization: 'Bearer x', apikey: 'k' });
    expect(picked).toEqual({});
    expect(pickHeaders(undefined)).toEqual({});
  });
  it('createEntry applies the whitelist and labels the request', () => {
    const e = createEntry({
      url: rest('tasks'),
      method: 'POST',
      headers: { Authorization: 'Bearer x', Prefer: 'return=minimal' },
      body: '{"title":"a"}',
    });
    expect(e.headers).toEqual({ prefer: 'return=minimal' });
    expect(e.label).toBe('POST tasks');
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof e.createdAt).toBe('number');
  });
});

suite('shouldQueue', () => {
  it('queues on network TypeError only', () => {
    expect(shouldQueue(new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldQueue(new Error('boom'))).toBe(false);
    expect(shouldQueue(new Response('nope', { status: 500 }))).toBe(false);
    expect(shouldQueue(new Response('nope', { status: 403 }))).toBe(false);
    expect(shouldQueue(undefined)).toBe(false);
  });
});

suite('buildOfflineResponse', () => {
  it('insert with return=representation → 201 array, ids injected into body', async () => {
    const e = entry({
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ title: 'Nueva' }),
    });
    const res = buildOfflineResponse(e);
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get(OFFLINE_RESPONSE_HEADER)).toBe('1');
    const data = (await res.json()) as Array<{ id: string; title: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]?.title).toBe('Nueva');
    expect(data[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    // The queued body carries the same id so the replay creates the same row.
    expect(JSON.parse(e.body!)).toEqual({ id: data[0]?.id, title: 'Nueva' });
  });

  it('honours Accept: pgrst.object+json → single object', async () => {
    const e = entry({
      headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' },
      body: JSON.stringify({ id: 'fixed-id', title: 'x' }),
    });
    const res = buildOfflineResponse(e);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'fixed-id', title: 'x' });
    expect(e.body).toBe(JSON.stringify({ id: 'fixed-id', title: 'x' })); // untouched
  });

  it('bulk insert keeps array shape and gives every row an id', async () => {
    const e = entry({
      headers: { prefer: 'return=representation' },
      body: JSON.stringify([{ name: 'a' }, { name: 'b', id: 'keep' }]),
    });
    const data = (await buildOfflineResponse(e).json()) as Array<{ id: string }>;
    expect(data).toHaveLength(2);
    expect(data[1]?.id).toBe('keep');
    expect(data[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    const queued = JSON.parse(e.body!) as Array<{ id: string }>;
    expect(Array.isArray(queued)).toBe(true);
    expect(queued[0]?.id).toBe(data[0]?.id);
  });

  it('does not inject ids for composite-PK tables', () => {
    const e = entry({
      url: rest('board_tasks'),
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ board_id: 'b', task_id: 't' }),
    });
    const rows = ensureIds(e);
    expect(rows?.[0]).toEqual({ board_id: 'b', task_id: 't' });
    expect(e.body).toBe(JSON.stringify({ board_id: 'b', task_id: 't' }));
  });

  it('PATCH without representation → 204 empty', async () => {
    const e = entry({ method: 'PATCH', url: rest('tasks?id=eq.1'), body: '{"priority":"high"}' });
    const res = buildOfflineResponse(e);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(e.body).toBe('{"priority":"high"}');
  });

  it('DELETE without representation → 204', () => {
    expect(buildOfflineResponse(entry({ method: 'DELETE', url: rest('tasks?id=eq.1') })).status).toBe(204);
  });

  it('insert with return=minimal → 201 empty', async () => {
    const e = entry({ headers: { prefer: 'return=minimal' }, body: '{"title":"a"}' });
    const res = buildOfflineResponse(e);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('');
  });

  it('PATCH with representation echoes the patch as a row', async () => {
    const e = entry({
      method: 'PATCH',
      url: rest('tasks?id=eq.1'),
      headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' },
      body: '{"status":"done"}',
    });
    const res = buildOfflineResponse(e);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'done' });
  });

  it('rpc → 200 null', async () => {
    const e = entry({ url: rest('rpc/save_checkin'), body: '{"p_kpi_id":"k"}' });
    const res = buildOfflineResponse(e);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(e.body).toBe('{"p_kpi_id":"k"}');
  });
});
