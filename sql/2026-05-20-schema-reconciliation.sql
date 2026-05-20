-- ============================================================
-- SCHEMA RECONCILIATION
-- ============================================================
-- Bridges the gap between the production DB (exported 2026-05-20)
-- and what the application code expects.
--
-- Includes the never-applied migrations:
--   - 2026-04-21-created-by.sql  (created_by on objectives/kpis/tasks)
--   - 2026-04-21-onboarding.sql  (onboarded_at on profiles)
--
-- Plus fixes for column-name mismatches and missing columns.
--
-- Idempotent. Safe to re-run.

-- ════════════════════════════════════════════════════════════
-- 1. WORKSPACES — add settings, updated_at
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ════════════════════════════════════════════════════════════
-- 2. PROFILES — add onboarded_at, updated_at
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ════════════════════════════════════════════════════════════
-- 3. KPIS — add created_by, updated_at
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS kpis_created_by_idx ON public.kpis(created_by);

-- ════════════════════════════════════════════════════════════
-- 4. OBJECTIVES — add created_by, updated_at
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS objectives_created_by_idx ON public.objectives(created_by);

-- ════════════════════════════════════════════════════════════
-- 5. TASKS — add created_by, updated_at
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks(created_by);

-- ════════════════════════════════════════════════════════════
-- 6. CREATED_BY TRIGGER — auto-stamp auth.uid() on INSERT
-- ════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════
-- 7. PROGRESS_LOGS — add period_id, workspace_id
-- ════════════════════════════════════════════════════════════
-- The code legitimately needs these for filtering (e.g. cron job
-- checks "has user reviewed this workspace/period this month?").
-- Existing columns: previous_value, new_value, comment (canonical).

ALTER TABLE public.progress_logs
  ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES public.periods(id) ON DELETE CASCADE;

ALTER TABLE public.progress_logs
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════
-- 8. NOTIFICATIONS — rename link → action_url
-- ════════════════════════════════════════════════════════════
-- Code everywhere uses action_url. Production column is named link.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'link'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'action_url'
  ) THEN
    ALTER TABLE public.notifications RENAME COLUMN link TO action_url;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 9. EMAIL_LOGS — add user_id, rename template → template_alias,
--    add postmark_message_id, relax to_email NOT NULL
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Rename template → template_alias (idempotent check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_logs'
      AND column_name = 'template'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_logs'
      AND column_name = 'template_alias'
  ) THEN
    ALTER TABLE public.email_logs RENAME COLUMN template TO template_alias;
  END IF;
END $$;

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS postmark_message_id text;

-- Production has `to_email text NOT NULL`, but the application code
-- inserts log rows without populating it (the recipient address is
-- already in Postmark). Without this, every email_logs INSERT fails
-- with a NOT NULL violation. Relax the constraint.
ALTER TABLE public.email_logs
  ALTER COLUMN to_email DROP NOT NULL;

-- ════════════════════════════════════════════════════════════
-- 10. UPDATED_AT TRIGGER — auto-touch on UPDATE
-- ════════════════════════════════════════════════════════════
-- Without a trigger, the updated_at columns we just added would
-- freeze at migration time. Wire them to auto-update on every row
-- change so the activity feed can use them as a recency signal.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_set_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS kpis_set_updated_at ON public.kpis;
CREATE TRIGGER kpis_set_updated_at
  BEFORE UPDATE ON public.kpis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS objectives_set_updated_at ON public.objectives;
CREATE TRIGGER objectives_set_updated_at
  BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════════
-- 11. RLS — progress_logs policies for new columns
-- ════════════════════════════════════════════════════════════
-- The existing SELECT/INSERT policies use workspace_id via
-- objective_id → objectives. With the new workspace_id column
-- we don't change the policy — the column is denormalized for
-- query convenience, not for RLS gating.

NOTIFY pgrst, 'reload schema';
