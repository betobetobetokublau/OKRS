/**
 * `fetch` wrapper handed to the Supabase browser client (`global.fetch`).
 *
 * Every PostgREST mutation goes through here. If the device is offline — or
 * the request dies with a network `TypeError` — the mutation is persisted to
 * the IndexedDB outbox and a synthetic PostgREST-shaped response is returned,
 * so `supabase.from(...).insert(...).select().single()` and friends resolve
 * normally and the optimistic UI keeps going. `replayOutbox` (sync.ts) sends
 * the queued requests once connectivity is back.
 *
 * Reads are NOT handled here (the service worker caches those).
 */
import {
  buildOfflineResponse,
  createEntry,
  isMutationRequest,
  isOffline,
  shouldQueue,
  type MutationMethod,
} from './outbox';
import { count, enqueue } from './outbox-db';
import { useOfflineStore } from '@/stores/offline-store';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

/**
 * postgrest-js always sends `JSON.stringify(body)` (a string, or `undefined`
 * for DELETE). Anything else (FormData, streams) is not something we can
 * safely persist and replay, so we signal "don't queue" with `undefined`.
 */
function serializableBody(body: BodyInit | null | undefined): string | null | undefined {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  return undefined;
}

async function queueAndRespond(
  url: string,
  method: MutationMethod,
  init: RequestInit | undefined,
  body: string | null
): Promise<Response> {
  const entry = createEntry({ url, method, headers: init?.headers, body });
  // Build the response FIRST: it may inject ids into `entry.body`, and the
  // persisted entry must carry them so the replay creates the same rows.
  const response = buildOfflineResponse(entry);
  try {
    await enqueue(entry);
    useOfflineStore.getState().setPendingCount(await count());
  } catch (err) {
    // IndexedDB refused (private mode quota, etc.). Surface as a network
    // failure so the caller's error path runs instead of silently lying.
    throw new TypeError(
      `No se pudo guardar la operación offline (${entry.label}): ${String(err)}`
    );
  }
  return response;
}

export async function offlineAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = requestUrl(input);
  const method = requestMethod(input, init);

  if (!isMutationRequest(url, method)) {
    return fetch(input, init);
  }

  const body = serializableBody(init?.body);
  if (body === undefined) {
    // Un-queueable payload; behave like plain fetch.
    return fetch(input, init);
  }
  const mutation = method as MutationMethod;

  // Known offline: don't even try — the browser would fail after a timeout
  // and the UI would feel frozen meanwhile.
  if (isOffline()) {
    return queueAndRespond(url, mutation, init, body);
  }

  try {
    return await fetch(input, init);
  } catch (err) {
    // Genuine network failure while `navigator.onLine` still said true
    // (captive portal, flaky radio…). HTTP errors never land here — they are
    // resolved Responses — so 4xx/5xx are never queued.
    if (shouldQueue(err)) {
      return queueAndRespond(url, mutation, init, body);
    }
    throw err;
  }
}
