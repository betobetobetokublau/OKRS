-- Activity-feed attribution: stamp every new objective / kpi / task with
-- the user who created it, so the unified timeline can render "Alberto
-- creó la tarea …" instead of "Alguien creó la tarea …".
--
-- Approach: add a `created_by` FK to auth.users on each table, and a
-- BEFORE INSERT trigger that defaults it to `auth.uid()`. Using a trigger
-- (rather than patching every .insert() call in the app) ensures existing
-- call sites automatically attribute, and any future call site is
-- covered without ceremony. Explicit inserts can still override the
-- value (e.g. service-role migrations / backfills).
--
-- Idempotent. Existing rows are left with `created_by = NULL` — we don't
-- know who created them and we'd rather show "Alguien" for those than
-- invent attribution.

-- ── Columns ───────────────────────────────────────────────────────────
ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes so the activity feed's profile lookup stays O(n) over recent
-- rows instead of O(n * profiles).
CREATE INDEX IF NOT EXISTS objectives_created_by_idx ON public.objectives(created_by);
CREATE INDEX IF NOT EXISTS kpis_created_by_idx       ON public.kpis(created_by);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx      ON public.tasks(created_by);

-- ── Trigger ──────────────────────────────────────────────────────────
-- SECURITY INVOKER: we WANT `auth.uid()` to reflect the caller's session
-- (not the function owner). NULL on insert → default to the caller;
-- explicit non-NULL values are respected (e.g. admin API routes using
-- the service role to recreate rows retain their explicit attribution).
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- One trigger per table. DROP IF EXISTS so re-running this file is safe.
DROP TRIGGER IF EXISTS objectives_set_created_by ON public.objectives;
CREATE TRIGGER objectives_set_created_by
  BEFORE INSERT ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

DROP TRIGGER IF EXISTS kpis_set_created_by ON public.kpis;
CREATE TRIGGER kpis_set_created_by
  BEFORE INSERT ON public.kpis
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

DROP TRIGGER IF EXISTS tasks_set_created_by ON public.tasks;
CREATE TRIGGER tasks_set_created_by
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

NOTIFY pgrst, 'reload schema';
