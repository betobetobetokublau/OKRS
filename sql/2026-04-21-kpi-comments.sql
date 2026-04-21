-- KPI comments + progress logs.
--
-- Symptom: commenting from a KPI detail view returned
--   PGRST204 "Could not find the 'kpi_id' column of 'comments' in the
--   schema cache"
-- because the `comments` and `progress_logs` tables only had
-- `objective_id`. The app (CommentTimeline, KPI detail panel) and the
-- activity feed hook have always expected both targets — so the real
-- fix is to add the missing column instead of further narrowing the
-- client code.
--
-- This migration:
--   1. Adds a nullable `kpi_id uuid` with an ON DELETE CASCADE FK on
--      both tables.
--   2. Drops NOT NULL from `objective_id` on both tables (no-op if
--      already nullable) so a comment/log can be attached to a KPI
--      without a sibling objective.
--   3. Adds a CHECK constraint that at least one of the two FKs is
--      populated. Avoids dangling rows and lets the activity feed
--      rely on "one of kpi_id OR objective_id is set" as an invariant.
--   4. Indexes the new column on both tables for the feed's IN()
--      lookups.
--
-- Idempotent. Safe to re-run.

-- ── comments ─────────────────────────────────────────────────────────
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS kpi_id uuid REFERENCES public.kpis(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ALTER COLUMN objective_id DROP NOT NULL;

-- Add the CHECK only if it doesn't already exist (pg_constraint lookup
-- keyed on name). Using DO block so the migration stays re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_target_check' AND conrelid = 'public.comments'::regclass
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_target_check
      CHECK (objective_id IS NOT NULL OR kpi_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS comments_kpi_id_idx ON public.comments(kpi_id);

-- ── progress_logs ────────────────────────────────────────────────────
ALTER TABLE public.progress_logs
  ADD COLUMN IF NOT EXISTS kpi_id uuid REFERENCES public.kpis(id) ON DELETE CASCADE;

ALTER TABLE public.progress_logs
  ALTER COLUMN objective_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'progress_logs_target_check' AND conrelid = 'public.progress_logs'::regclass
  ) THEN
    ALTER TABLE public.progress_logs
      ADD CONSTRAINT progress_logs_target_check
      CHECK (objective_id IS NOT NULL OR kpi_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS progress_logs_kpi_id_idx ON public.progress_logs(kpi_id);

NOTIFY pgrst, 'reload schema';
