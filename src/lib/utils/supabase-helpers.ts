/**
 * Helpers for unwrapping Supabase nested-select responses into clean
 * application types. Supabase's TypeScript codegen doesn't propagate
 * the shape of `select('rel:relation(*)')` joins, so call sites end up
 * with `(r: any) => r.relation` patterns. These helpers centralise the
 * cast so the `any` only lives in one place.
 */

type Row = Record<string, unknown>;

/**
 * Given the data array from a Supabase select with a nested relation,
 * pull each row's named relation out as a clean typed array. Drops
 * rows where the relation is null/undefined (e.g. LEFT JOIN misses).
 *
 * Example:
 *   const { data } = await supabase
 *     .from('user_workspaces')
 *     .select('profile:profiles(*)')
 *     .eq('workspace_id', wsId);
 *   const profiles = unwrapRelation<Profile>(data, 'profile');
 */
export function unwrapRelation<T>(rows: Row[] | null | undefined, key: string): T[] {
  if (!rows) return [];
  const out: T[] = [];
  for (const r of rows) {
    const v = r?.[key];
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) out.push(v[0] as T);
    } else {
      out.push(v as T);
    }
  }
  return out;
}

/**
 * Pluck a single scalar column from each row. Drops null/undefined.
 *
 * Example:
 *   const ids = pluck<string>(kpiObjectivesRes.data, 'objective_id');
 */
export function pluck<T>(rows: Row[] | null | undefined, key: string): T[] {
  if (!rows) return [];
  const out: T[] = [];
  for (const r of rows) {
    const v = r?.[key];
    if (v != null) out.push(v as T);
  }
  return out;
}
