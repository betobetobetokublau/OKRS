-- Allow all workspace members to delete KPIs, objectives, tasks, and
-- their junction/log tables. Idempotent — safe to re-run.

-- ── KPIs ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can delete KPIs in their workspaces" ON kpis;
CREATE POLICY "Members can delete KPIs in their workspaces" ON kpis
  FOR DELETE TO authenticated
  USING (public.user_is_in_workspace(workspace_id));

-- ── Objectives ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can delete objectives in their workspaces" ON objectives;
CREATE POLICY "Members can delete objectives in their workspaces" ON objectives
  FOR DELETE TO authenticated
  USING (public.user_is_in_workspace(workspace_id));

-- ── Tasks (join through objective to reach workspace) ───────────────
DROP POLICY IF EXISTS "Members can delete tasks in their workspaces" ON tasks;
CREATE POLICY "Members can delete tasks in their workspaces" ON tasks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM objectives o
      WHERE o.id = objective_id
        AND public.user_is_in_workspace(o.workspace_id)
    )
  );

-- ── Junction tables ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can delete kpi_objectives" ON kpi_objectives;
CREATE POLICY "Members can delete kpi_objectives" ON kpi_objectives
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kpis k
      WHERE k.id = kpi_id
        AND public.user_is_in_workspace(k.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Members can delete kpi_departments" ON kpi_departments;
CREATE POLICY "Members can delete kpi_departments" ON kpi_departments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kpis k
      WHERE k.id = kpi_id
        AND public.user_is_in_workspace(k.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Members can delete objective_departments" ON objective_departments;
CREATE POLICY "Members can delete objective_departments" ON objective_departments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM objectives o
      WHERE o.id = objective_id
        AND public.user_is_in_workspace(o.workspace_id)
    )
  );

-- ── Progress logs (has objective_id and kpi_id, NO task_id) ─────────
DROP POLICY IF EXISTS "Members can delete progress_logs" ON progress_logs;
CREATE POLICY "Members can delete progress_logs" ON progress_logs
  FOR DELETE TO authenticated
  USING (
    (kpi_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM kpis k WHERE k.id = kpi_id AND public.user_is_in_workspace(k.workspace_id)
    ))
    OR
    (objective_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM objectives o WHERE o.id = objective_id AND public.user_is_in_workspace(o.workspace_id)
    ))
  );

-- ── Comments (has objective_id and kpi_id) ──────────────────────────
DROP POLICY IF EXISTS "Members can delete comments" ON comments;
CREATE POLICY "Members can delete comments" ON comments
  FOR DELETE TO authenticated
  USING (
    (kpi_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM kpis k WHERE k.id = kpi_id AND public.user_is_in_workspace(k.workspace_id)
    ))
    OR
    (objective_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM objectives o WHERE o.id = objective_id AND public.user_is_in_workspace(o.workspace_id)
    ))
  );

-- ── Allow members to INSERT/UPDATE KPIs (previously manager+) ───────
DROP POLICY IF EXISTS "Members can insert KPIs" ON kpis;
CREATE POLICY "Members can insert KPIs" ON kpis
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_in_workspace(workspace_id));

DROP POLICY IF EXISTS "Members can update KPIs" ON kpis;
CREATE POLICY "Members can update KPIs" ON kpis
  FOR UPDATE TO authenticated
  USING (public.user_is_in_workspace(workspace_id));

NOTIFY pgrst, 'reload schema';
