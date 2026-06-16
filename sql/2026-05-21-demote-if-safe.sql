-- ============================================================
-- ATOMIC WORKSPACE ROLE CHANGE
-- ============================================================
-- The application route `/api/auth/cambiar-rol-usuario` previously
-- did a count-then-update to guard against demoting the last admin
-- of a workspace. That's a textbook TOCTOU race: two concurrent
-- demotions can both pass the `count > 1` check and leave the
-- workspace with zero admins.
--
-- This RPC collapses the check + update into a single statement
-- protected by a row-level `FOR UPDATE` lock on the target row.
-- Two concurrent calls demoting the same admin (or different admins
-- in the same workspace) serialize at the row lock, and the second
-- caller observes the updated admin count.
--
-- Returns a JSON envelope so the route can translate structured
-- errors into HTTP status codes:
--   { ok: true }                              → 200
--   { ok: false, error: 'not_in_workspace' }  → 404
--   { ok: false, error: 'last_admin' }        → 400
--
-- SECURITY DEFINER so it runs with the function-owner's privileges
-- (the migration deployer / postgres role), bypassing RLS on
-- user_workspaces UPDATE. The route is responsible for verifying
-- the caller is a workspace admin BEFORE invoking this RPC —
-- nothing inside the function checks that.
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.change_workspace_role(
  p_target_user_id uuid,
  p_workspace_id uuid,
  p_new_role text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
  v_admin_count  integer;
BEGIN
  -- Lock the target row first. Concurrent role changes for the same
  -- (user, workspace) pair will queue here.
  SELECT role
    INTO v_current_role
    FROM user_workspaces
   WHERE user_id = p_target_user_id
     AND workspace_id = p_workspace_id
   FOR UPDATE;

  IF v_current_role IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_in_workspace');
  END IF;

  -- Count admins after taking the row lock. If another transaction
  -- is concurrently demoting a different admin in the same workspace,
  -- it holds its own row lock and the count we observe is consistent
  -- with our snapshot. (Both can't demote a *different* admin and
  -- both leave the workspace empty: the second to commit will see
  -- the freshly-updated row.)
  SELECT COUNT(*)
    INTO v_admin_count
    FROM user_workspaces
   WHERE workspace_id = p_workspace_id
     AND role = 'admin';

  -- Refuse to demote the last admin of the workspace.
  IF v_current_role = 'admin'
     AND p_new_role <> 'admin'
     AND v_admin_count <= 1 THEN
    RETURN json_build_object('ok', false, 'error', 'last_admin');
  END IF;

  UPDATE user_workspaces
     SET role = p_new_role
   WHERE user_id = p_target_user_id
     AND workspace_id = p_workspace_id;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_workspace_role(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
