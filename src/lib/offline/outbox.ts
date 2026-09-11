/**
 * Pure logic for the offline outbox: deciding what to queue, describing it,
 * and synthesising the response PostgREST would have returned so that the
 * calling code (supabase-js builders + our optimistic UI) keeps working
 * while the device has no connectivity.
 *
 * No IndexedDB / DOM side effects live here so it can be unit-tested in node.
 */

export type MutationMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface OutboxEntry {
  /** Idempotency key. Also used as the IndexedDB primary key. */
  id: string;
  /** `Date.now()` at enqueue time; replay order. */
  createdAt: number;
  url: string;
  method: MutationMethod;
  /**
   * Whitelisted request headers only (see HEADER_WHITELIST). Never contains
   * `authorization` / `apikey`: those are re-attached at replay from the live
   * session so a stale token is never persisted to disk.
   */
  headers: Record<string, string>;
  /** Raw JSON body as sent by postgrest-js (always a string there). */
  body: string | null;
  /** Human-readable label, e.g. `PATCH tasks` / `POST rpc/save_checkin`. */
  label: string;
}

const MUTATION_METHODS: ReadonlySet<string> = new Set<MutationMethod>([
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
]);

/** Lower-cased header names we persist with each queued request. */
export const HEADER_WHITELIST: readonly string[] = [
  'content-type',
  'prefer',
  'accept',
  'content-profile',
  'accept-profile',
  'x-client-info',
];

/**
 * Tables whose primary key is composite (no `id` column). Injecting an `id`
 * into an insert for these would make PostgREST reject the replay with a
 * "column does not exist" 400, so they are skipped by `ensureIds`.
 * Keep in sync with sql/SCHEMA.md.
 */
const TABLES_WITHOUT_ID: ReadonlySet<string> = new Set(['board_members', 'board_tasks']);

/** Marker header so devtools / SW can tell synthetic responses apart. */
export const OFFLINE_RESPONSE_HEADER = 'x-kublau-offline';

function supabaseOrigin(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
}

/**
 * True for data mutations against our Supabase project's PostgREST endpoint:
 * same origin as NEXT_PUBLIC_SUPABASE_URL, path under `/rest/v1/` (tables and
 * `/rest/v1/rpc/*`), method POST/PATCH/PUT/DELETE. Auth, storage and realtime
 * traffic is never queued — replaying a login or an upload later makes no sense.
 */
export function isMutationRequest(
  url: string,
  method: string | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): boolean {
  const m = (method ?? 'GET').toUpperCase();
  if (!MUTATION_METHODS.has(m)) return false;
  const origin = supabaseOrigin(supabaseUrl);
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== origin) return false;
  return parsed.pathname.startsWith('/rest/v1/');
}

/** Table (or `rpc/<fn>`) targeted by a PostgREST URL, or `null` if not one. */
export function restTarget(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const rest = parsed.pathname.replace(/^\/rest\/v1\//, '');
  if (rest === parsed.pathname) return null;
  const segments = rest.split('/').filter(Boolean);
  const first = segments[0];
  if (!first) return null;
  if (first === 'rpc') {
    const fn = segments[1];
    return fn ? `rpc/${fn}` : 'rpc';
  }
  return first;
}

/** `PATCH tasks`, `POST rpc/save_checkin`, … — shown to the user in failures. */
export function describe(url: string, method: string): string {
  const target = restTarget(url) ?? url;
  return `${method.toUpperCase()} ${target}`;
}

/**
 * Keep only whitelisted headers, lower-cased. Accepts anything `fetch` does
 * (Headers instance, tuples, plain record).
 */
export function pickHeaders(input: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const h = new Headers(input);
  h.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HEADER_WHITELIST.includes(k)) out[k] = value;
  });
  return out;
}

/**
 * Decide whether a failed attempt should be queued. Only genuine network
 * failures qualify — `fetch` rejects with a `TypeError` when the request never
 * reached a server. Anything that *is* a `Response` (4xx/5xx included) came
 * back from the server and must be surfaced to the caller as-is. Aborts
 * (`AbortError` DOMException) are not queued either: the caller cancelled.
 */
export function shouldQueue(errorOrResponse: unknown): boolean {
  if (errorOrResponse instanceof Response) return false;
  return errorOrResponse instanceof TypeError;
}

/** `navigator.onLine === false` — the only signal we trust *before* trying. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function wantsRepresentation(entry: OutboxEntry): boolean {
  return /return=representation/i.test(entry.headers['prefer'] ?? '');
}

function wantsSingleObject(entry: OutboxEntry): boolean {
  return /application\/vnd\.pgrst\.object\+json/i.test(entry.headers['accept'] ?? '');
}

function newId(): string {
  // crypto.randomUUID exists in every browser we target and in node >= 19.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: RFC4122-ish v4 from Math.random. Only reached in odd runtimes.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse the queued body as an array of row objects. Returns `null` when the
 * body is not JSON object(s) — e.g. RPC args, or a PATCH `{ status: 'done' }`
 * (which is also an object, but the caller only invokes this for inserts).
 */
function parseRows(body: string | null): JsonRecord[] | null {
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    return parsed.every(isRecord) ? (parsed as JsonRecord[]) : null;
  }
  return isRecord(parsed) ? [parsed] : null;
}

/**
 * Ensure every inserted row has an `id`. The id is written BACK into
 * `entry.body` (mutating the entry) so the replayed INSERT creates the very
 * same row the UI already knows about, and any later queued PATCH/DELETE that
 * references it (e.g. "create task, then set its priority") stays consistent.
 * Returns the rows (with ids) or `null` when the body isn't rows.
 */
export function ensureIds(entry: OutboxEntry): JsonRecord[] | null {
  const rows = parseRows(entry.body);
  if (!rows) return null;
  const target = restTarget(entry.url);
  if (target && TABLES_WITHOUT_ID.has(target)) return rows;
  let changed = false;
  for (const row of rows) {
    if (row['id'] === undefined || row['id'] === null || row['id'] === '') {
      row['id'] = newId();
      changed = true;
    }
  }
  if (changed) {
    // Preserve the original shape (single object vs array) so PostgREST
    // treats the replay exactly like the original request.
    const wasArray = entry.body?.trimStart().startsWith('[') ?? false;
    entry.body = JSON.stringify(wasArray ? rows : rows[0]);
  }
  return rows;
}

/**
 * Synthesize the response PostgREST would have produced.
 *
 * - RPC → 200 `null` (callers of `.rpc()` only check `error`).
 * - POST/PUT with `Prefer: return=representation` → 201 echoing the rows
 *   (array, or the single object when `Accept: application/vnd.pgrst.object+json`),
 *   ids injected via `ensureIds` — this mutates `entry.body`, so call it BEFORE
 *   persisting the entry.
 * - PATCH/DELETE with representation → 200 echoing the (patch) body, so
 *   `.update(...).select().single()` callers get *something* shaped like a row.
 * - Everything else → 204 with an empty body (`return=minimal` default).
 */
export function buildOfflineResponse(entry: OutboxEntry): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [OFFLINE_RESPONSE_HEADER]: '1',
  };
  const target = restTarget(entry.url);
  const isRpc = target === 'rpc' || (target?.startsWith('rpc/') ?? false);

  if (isRpc) {
    return new Response('null', { status: 200, headers });
  }

  const isInsert = entry.method === 'POST' || entry.method === 'PUT';
  const rows = isInsert ? ensureIds(entry) : null;

  if (!wantsRepresentation(entry)) {
    // No body expected; postgrest-js reads `''` and yields `data: null`.
    return new Response(null, { status: isInsert ? 201 : 204, headers });
  }

  const echoed: unknown = rows ?? parseRows(entry.body) ?? [];
  const asArray = Array.isArray(echoed) ? echoed : [echoed];
  const payload = wantsSingleObject(entry) ? (asArray[0] ?? null) : asArray;
  return new Response(JSON.stringify(payload), { status: isInsert ? 201 : 200, headers });
}

/** Assemble a fresh entry from the pieces `fetch` gives us. */
export function createEntry(params: {
  url: string;
  method: MutationMethod;
  headers: HeadersInit | undefined;
  body: string | null;
}): OutboxEntry {
  return {
    id: newId(),
    createdAt: Date.now(),
    url: params.url,
    method: params.method,
    headers: pickHeaders(params.headers),
    body: params.body,
    label: describe(params.url, params.method),
  };
}
