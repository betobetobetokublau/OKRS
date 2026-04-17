import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

/**
 * Parse + validate a JSON request body against a zod schema. Returns either
 * the typed data on success, or a ready-to-return 400 NextResponse whose
 * JSON body is `{ error, issues }` where `issues` is the flattened zod
 * error.
 *
 * Usage:
 *   const parsed = await parseJsonBody(request, schema);
 *   if (parsed instanceof NextResponse) return parsed;
 *   const data = parsed;
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: 'Datos inválidos',
        issues: result.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  return result.data;
}
