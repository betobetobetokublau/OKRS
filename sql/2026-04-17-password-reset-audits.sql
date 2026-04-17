-- Audit trail for admin-initiated password resets.
-- Written exclusively by the /api/auth/cambiar-password-usuario endpoint
-- using the service-role key. RLS is enabled so authenticated users can
-- only read audit rows for workspaces they belong to (useful for letting
-- admins see who changed whose password from inside the app later); no
-- direct writes are allowed from the client under any role.
--
-- Run against Supabase; safe to re-run.

CREATE TABLE IF NOT EXISTS public.password_reset_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  must_change_password BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_audits_workspace_idx
  ON public.password_reset_audits(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_audits_target_idx
  ON public.password_reset_audits(target_user_id, created_at DESC);

ALTER TABLE public.password_reset_audits ENABLE ROW LEVEL SECURITY;

-- SELECT: admins in the workspace can read audit rows for that workspace.
-- Uses the existing user_is_in_workspace helper (created by
-- 2026-04-16-workspace-visibility.sql / 2026-04-16-checkins.sql). If that
-- migration hasn't been run yet, recreate the helper here too.
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

DROP POLICY IF EXISTS "password_reset_audits: admin read" ON public.password_reset_audits;
CREATE POLICY "password_reset_audits: admin read" ON public.password_reset_audits
  FOR SELECT TO authenticated
  USING (
    public.user_is_in_workspace(workspace_id)
    AND EXISTS (
      SELECT 1 FROM public.user_workspaces uw
      WHERE uw.user_id = auth.uid()
        AND uw.workspace_id = password_reset_audits.workspace_id
        AND uw.role = 'admin'
    )
  );

-- No INSERT / UPDATE / DELETE policies: only the service role (via the
-- admin client in /api/auth/cambiar-password-usuario) may write.

NOTIFY pgrst, 'reload schema';
