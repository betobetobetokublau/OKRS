-- Check-in feature: users record a session where they update their own and
-- their team's objectives/tasks in bulk. A `checkin` is one session; each
-- objective/task touched during the session becomes a `checkin_entry`.
--
-- Run against Supabase; safe to re-run. Self-contained — creates the
-- `user_is_in_workspace` helper locally so it can be run in any order
-- relative to 2026-04-16-workspace-visibility.sql.

-- Helper: is the current auth.uid() a member of the given workspace?
-- SECURITY DEFINER avoids recursing through user_workspaces RLS.
CREATE OR REPLACE FUNCTION public.user_is_in_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_workspaces
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_in_workspace(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.periods(id) ON DELETE SET NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkin_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES public.checkins(id) ON DELETE CASCADE,
  objective_id UUID REFERENCES public.objectives(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  previous_progress INTEGER,
  new_progress INTEGER,
  previous_status TEXT,
  new_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkin_entries_target_check CHECK (
    objective_id IS NOT NULL OR task_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS checkins_workspace_created_idx
  ON public.checkins(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checkins_user_created_idx
  ON public.checkins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checkin_entries_checkin_idx
  ON public.checkin_entries(checkin_id);
CREATE INDEX IF NOT EXISTS checkin_entries_objective_idx
  ON public.checkin_entries(objective_id);
CREATE INDEX IF NOT EXISTS checkin_entries_task_idx
  ON public.checkin_entries(task_id);

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_entries ENABLE ROW LEVEL SECURITY;

-- Read: anyone in the workspace can see all check-ins for that workspace
-- (so managers can review the team's activity).
DROP POLICY IF EXISTS "checkins: read in workspace" ON public.checkins;
CREATE POLICY "checkins: read in workspace" ON public.checkins
  FOR SELECT TO authenticated
  USING (public.user_is_in_workspace(workspace_id));

DROP POLICY IF EXISTS "checkin_entries: read in workspace" ON public.checkin_entries;
CREATE POLICY "checkin_entries: read in workspace" ON public.checkin_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.checkins c
      WHERE c.id = checkin_id AND public.user_is_in_workspace(c.workspace_id)
    )
  );

-- Insert: a user can only create their own check-in in a workspace they
-- belong to; entries must hang off a check-in they created.
DROP POLICY IF EXISTS "checkins: insert own" ON public.checkins;
CREATE POLICY "checkins: insert own" ON public.checkins
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.user_is_in_workspace(workspace_id));

DROP POLICY IF EXISTS "checkin_entries: insert own" ON public.checkin_entries;
CREATE POLICY "checkin_entries: insert own" ON public.checkin_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.checkins c
      WHERE c.id = checkin_id AND c.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
