import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { parseJsonBody } from './parse-body';

const schema = z.object({ name: z.string().min(1), n: z.number().int() });

function postWithBody(body: string): Request {
  return new Request('https://example.test/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('parseJsonBody', () => {
  it('returns typed data when the body is valid', async () => {
    const res = await parseJsonBody(postWithBody('{"name":"ada","n":42}'), schema);
    expect(res).not.toBeInstanceOf(NextResponse);
    if (!(res instanceof NextResponse)) {
      expect(res.name).toBe('ada');
      expect(res.n).toBe(42);
    }
  });

  it('returns a 400 NextResponse when JSON is malformed', async () => {
    const res = await parseJsonBody(postWithBody('not json'), schema);
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('JSON inválido');
    }
  });

  it('returns a 400 NextResponse with flattened issues on schema failure', async () => {
    const res = await parseJsonBody(postWithBody('{"name":"","n":"NaN"}'), schema);
    expect(res).toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) {
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: string;
        issues: Array<{ path: (string | number)[]; message: string }>;
      };
      expect(body.error).toBe('Datos inválidos');
      expect(body.issues.length).toBeGreaterThan(0);
      expect(body.issues.some((i) => i.path.includes('name'))).toBe(true);
      expect(body.issues.some((i) => i.path.includes('n'))).toBe(true);
    }
  });
});
