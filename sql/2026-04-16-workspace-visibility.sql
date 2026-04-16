-- Fix: the Equipo view shows only the logged-in user, even for admins.
--
-- The existing SELECT policies on `user_workspaces` and `profiles` appear
-- to restrict rows to the caller's own user_id. Replace them with policies
-- that let anyone in a workspace read the full member list of that workspace,
-- using a SECURITY DEFINER helper so the user_workspaces self-SELECT does
-- not recurse through its own RLS.
--
-- Run against Supabase; safe to re-run (idempotent).

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

CREATE OR REPLACE FUNCTION public.user_shares_workspace(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_workspaces caller
    JOIN public.user_workspaces target
      ON target.workspace_id = caller.workspace_id
    WHERE caller.user_id = auth.uid()
      AND target.user_id = _profile_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_shares_workspace(uuid) TO authenticated;

-- Replace any prior SELECT policies with ones that widen visibility.
DROP POLICY IF EXISTS "read workspace members" ON public.user_workspaces;
DROP POLICY IF EXISTS "user_workspaces: read own" ON public.user_workspaces;
DROP POLICY IF EXISTS "user_workspaces_select" ON public.user_workspaces;
CREATE POLICY "read workspace members" ON public.user_workspaces
  FOR SELECT TO authenticated
  USING (public.user_is_in_workspace(workspace_id));

DROP POLICY IF EXISTS "read workspace profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles: read own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "read workspace profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR public.user_shares_workspace(id)
  );

-- Also widen user_departments so the Equipo view can load each member's
-- department list (parallel bug).
DROP POLICY IF EXISTS "read workspace user_departments" ON public.user_departments;
CREATE POLICY "read workspace user_departments" ON public.user_departments
  FOR SELECT TO authenticated
  USING (public.user_shares_workspace(user_id));

NOTIFY pgrst, 'reload schema';
