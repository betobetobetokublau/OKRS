-- RLS workspace-isolation test.
--
-- Run this against a dev Supabase project (NOT prod). Seeds two workspaces
-- with one user each, switches into each user's JWT via set_config, and
-- asserts that each user sees only their own workspace's rows across every
-- tenant-scoped table. Any cross-workspace read is a P0 data-bleed bug.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f sql/tests/rls-workspace-isolation.test.sql
--
-- Cleans up at the end. Safe to re-run.

BEGIN;

-- ---------- 0. Fixture users + workspaces ----------
-- We write to auth.users directly because the Supabase service role owns it
-- in a dev project. For a CI run, prefer the admin API; this script is
-- intended for local Supabase.

DO $$
DECLARE
  uid_a uuid := '00000000-0000-0000-0000-0000000000a1';
  uid_b uuid := '00000000-0000-0000-0000-0000000000b1';
  ws_a  uuid := '00000000-0000-0000-0000-00000000aaaa';
  ws_b  uuid := '00000000-0000-0000-0000-00000000bbbb';
  per_a uuid := '00000000-0000-0000-0000-0000000aaaaa';
  per_b uuid := '00000000-0000-0000-0000-0000000bbbbb';
  obj_a uuid := '00000000-0000-0000-0000-00000000aa01';
  obj_b uuid := '00000000-0000-0000-0000-00000000bb01';
  kpi_a uuid := '00000000-0000-0000-0000-00000000aa02';
  kpi_b uuid := '00000000-0000-0000-0000-00000000bb02';
BEGIN
  -- auth.users (idempotent)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
    VALUES (uid_a, 'rls-a@test.local', '', now(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
    VALUES (uid_b, 'rls-b@test.local', '', now(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

  -- profiles
  INSERT INTO public.profiles (id, email, full_name, must_change_password)
    VALUES (uid_a, 'rls-a@test.local', 'RLS A', false)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, full_name, must_change_password)
    VALUES (uid_b, 'rls-b@test.local', 'RLS B', false)
    ON CONFLICT (id) DO NOTHING;

  -- workspaces
  INSERT INTO public.workspaces (id, name, slug, settings)
    VALUES (ws_a, 'RLS Workspace A', 'rls-a', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspaces (id, name, slug, settings)
    VALUES (ws_b, 'RLS Workspace B', 'rls-b', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

  -- membership (each user in their own workspace only)
  INSERT INTO public.user_workspaces (user_id, workspace_id, role)
    VALUES (uid_a, ws_a, 'admin')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.user_workspaces (user_id, workspace_id, role)
    VALUES (uid_b, ws_b, 'admin')
    ON CONFLICT DO NOTHING;

  -- periods
  INSERT INTO public.periods (id, workspace_id, name, start_date, end_date, status)
    VALUES (per_a, ws_a, 'Q1 2026', '2026-01-01', '2026-03-31', 'active')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.periods (id, workspace_id, name, start_date, end_date, status)
    VALUES (per_b, ws_b, 'Q1 2026', '2026-01-01', '2026-03-31', 'active')
    ON CONFLICT (id) DO NOTHING;

  -- objectives
  INSERT INTO public.objectives (id, workspace_id, period_id, title, status, progress_mode, manual_progress)
    VALUES (obj_a, ws_a, per_a, 'Obj A', 'in_progress', 'auto', 0)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.objectives (id, workspace_id, period_id, title, status, progress_mode, manual_progress)
    VALUES (obj_b, ws_b, per_b, 'Obj B', 'in_progress', 'auto', 0)
    ON CONFLICT (id) DO NOTHING;

  -- kpis
  INSERT INTO public.kpis (id, workspace_id, period_id, title, progress_mode, manual_progress, status, sort_order)
    VALUES (kpi_a, ws_a, per_a, 'KPI A', 'auto', 0, 'on_track', 0)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.kpis (id, workspace_id, period_id, title, progress_mode, manual_progress, status, sort_order)
    VALUES (kpi_b, ws_b, per_b, 'KPI B', 'auto', 0, 'on_track', 0)
    ON CONFLICT (id) DO NOTHING;
END $$;

-- ---------- Helpers ----------

-- Switch RLS to act as a given user. Supabase RLS reads auth.uid() from
-- the request.jwt.claims GUC; we fake it by setting the sub claim directly.
CREATE OR REPLACE FUNCTION _rls_as(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text,
    true
  );
END $$;

CREATE OR REPLACE FUNCTION _assert(cond boolean, msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'RLS TEST FAILED: %', msg;
  ELSE
    RAISE NOTICE 'RLS OK: %', msg;
  END IF;
END $$;

-- ---------- Tests ----------

-- Act as user A.
SELECT _rls_as('00000000-0000-0000-0000-0000000000a1'::uuid);

-- A sees their own workspace.
SELECT _assert(
  (SELECT count(*) FROM public.workspaces WHERE slug = 'rls-a') = 1,
  'user A can read own workspace'
);
-- A does NOT see workspace B.
SELECT _assert(
  (SELECT count(*) FROM public.workspaces WHERE slug = 'rls-b') = 0,
  'user A cannot read workspace B'
);
-- A does NOT see objectives from workspace B.
SELECT _assert(
  (SELECT count(*) FROM public.objectives WHERE title = 'Obj B') = 0,
  'user A cannot read workspace B objectives'
);
-- A does NOT see KPIs from workspace B.
SELECT _assert(
  (SELECT count(*) FROM public.kpis WHERE title = 'KPI B') = 0,
  'user A cannot read workspace B KPIs'
);
-- A does NOT see B's membership row.
SELECT _assert(
  (SELECT count(*) FROM public.user_workspaces
    WHERE user_id = '00000000-0000-0000-0000-0000000000b1'::uuid) = 0,
  'user A cannot read workspace B membership'
);
-- A does NOT see B's profile (user_shares_workspace should be false).
SELECT _assert(
  (SELECT count(*) FROM public.profiles
    WHERE email = 'rls-b@test.local') = 0,
  'user A cannot read user B profile'
);
-- A cannot INSERT an objective into workspace B (should be blocked by
-- INSERT RLS; if no INSERT policy exists, this raises).
DO $$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.objectives (id, workspace_id, period_id, title, status, progress_mode, manual_progress)
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-00000000bbbb'::uuid,
      '00000000-0000-0000-0000-0000000bbbbb'::uuid,
      'cross-tenant injection',
      'in_progress', 'auto', 0
    );
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := true;
  END;
  PERFORM _assert(ok, 'user A cannot INSERT objective into workspace B');
END $$;

-- Act as user B.
SELECT _rls_as('00000000-0000-0000-0000-0000000000b1'::uuid);

SELECT _assert(
  (SELECT count(*) FROM public.workspaces WHERE slug = 'rls-b') = 1,
  'user B can read own workspace'
);
SELECT _assert(
  (SELECT count(*) FROM public.workspaces WHERE slug = 'rls-a') = 0,
  'user B cannot read workspace A'
);
SELECT _assert(
  (SELECT count(*) FROM public.objectives WHERE title = 'Obj A') = 0,
  'user B cannot read workspace A objectives'
);

-- Act as anon (no JWT). Should see nothing from tenant tables.
DO $$ BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

SELECT _assert(
  (SELECT count(*) FROM public.workspaces WHERE slug LIKE 'rls-%') = 0,
  'anon cannot read any tenant workspace'
);
SELECT _assert(
  (SELECT count(*) FROM public.objectives WHERE title IN ('Obj A', 'Obj B')) = 0,
  'anon cannot read any tenant objective'
);

-- ---------- Cleanup ----------
RESET ROLE;
RESET ALL;

DROP FUNCTION IF EXISTS _rls_as(uuid);
DROP FUNCTION IF EXISTS _assert(boolean, text);

DELETE FROM public.kpis WHERE id IN (
  '00000000-0000-0000-0000-00000000aa02'::uuid,
  '00000000-0000-0000-0000-00000000bb02'::uuid
);
DELETE FROM public.objectives WHERE id IN (
  '00000000-0000-0000-0000-00000000aa01'::uuid,
  '00000000-0000-0000-0000-00000000bb01'::uuid
);
DELETE FROM public.periods WHERE id IN (
  '00000000-0000-0000-0000-0000000aaaaa'::uuid,
  '00000000-0000-0000-0000-0000000bbbbb'::uuid
);
DELETE FROM public.user_workspaces
  WHERE workspace_id IN (
    '00000000-0000-0000-0000-00000000aaaa'::uuid,
    '00000000-0000-0000-0000-00000000bbbb'::uuid
  );
DELETE FROM public.workspaces WHERE id IN (
  '00000000-0000-0000-0000-00000000aaaa'::uuid,
  '00000000-0000-0000-0000-00000000bbbb'::uuid
);
DELETE FROM public.profiles WHERE id IN (
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '00000000-0000-0000-0000-0000000000b1'::uuid
);
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '00000000-0000-0000-0000-0000000000b1'::uuid
);

COMMIT;

-- If any RAISE EXCEPTION above fired, psql will print "RLS TEST FAILED: ..."
-- and abort the transaction (so cleanup is skipped — re-run to re-seed).
