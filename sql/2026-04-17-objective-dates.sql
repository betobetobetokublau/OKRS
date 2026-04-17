-- Optional start and end dates on objectives.
-- Used to compute a "behind schedule" metric: objectives with < 50% progress
-- and > 50% of their window elapsed.
--
-- Run against Supabase; safe to re-run.

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE;

-- Optional sanity check: end_date, when set, should not precede start_date.
ALTER TABLE public.objectives
  DROP CONSTRAINT IF EXISTS objectives_date_window_check;
ALTER TABLE public.objectives
  ADD CONSTRAINT objectives_date_window_check
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

NOTIFY pgrst, 'reload schema';
