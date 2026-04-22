-- ============================================================
-- DATA CLEANSE: wipe OKR data + all users except yourself
-- ============================================================
--
-- DESTRUCTIVO. NO HAY BACKUP. LEE ANTES DE EJECUTAR.
--
-- Borra:
--   - kpis, objectives, tasks (y sus junctions: kpi_objectives,
--     kpi_departments, objective_departments)
--   - timeline completo (comments, progress_logs, checkins,
--     checkin_entries)
--   - notifications y email_logs de otros usuarios
--   - profiles, user_workspaces, user_departments y auth.users
--     de todos menos tú
--
-- Preserva:
--   - workspaces, periods, departments
--   - tu propio auth.users / profiles / user_workspaces /
--     user_departments
--   - password_reset_audits donde seas tú el actor (cascade
--     SET NULL cuando los objetivos borrados eran el target)
--
-- USO:
--   1) Encuentra tu UUID:
--        SELECT id, email FROM auth.users WHERE email = 'tu@email.com';
--   2) Pega el UUID en KEEP_USER_ID abajo.
--   3) Deja DRY_RUN := true la primera vez. Al correrlo, el DO
--      block ejecuta todos los DELETE, imprime los conteos, y
--      hace ROLLBACK automático via RAISE EXCEPTION.
--   4) Revisa los NOTICE en la consola. Si los números
--      cuadran, cambia DRY_RUN a false y vuelve a correr para
--      aplicar de verdad.
--
-- Todo el bloque es atómico: si algo falla, nada persiste.

DO $$
DECLARE
  -- ▼▼▼ EDITA ESTOS DOS VALORES ▼▼▼
  KEEP_USER_ID constant uuid    := '00000000-0000-0000-0000-000000000000'::uuid;
  DRY_RUN      constant boolean := true;
  -- ▲▲▲ EDITA ESTOS DOS VALORES ▲▲▲

  cnt_other_users  integer;
  cnt_kpis         integer;
  cnt_objectives   integer;
  cnt_tasks        integer;
  cnt_checkins     integer;
BEGIN
  -- Guardrails
  IF KEEP_USER_ID = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'KEEP_USER_ID sigue siendo el placeholder. Pega tu UUID real antes de correr.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = KEEP_USER_ID) THEN
    RAISE EXCEPTION 'El UUID % no existe en auth.users. Verifica que sea el tuyo.', KEEP_USER_ID;
  END IF;

  -- Snapshot ANTES del borrado (lo que se va a destruir)
  SELECT COUNT(*) INTO cnt_other_users FROM auth.users        WHERE id <> KEEP_USER_ID;
  SELECT COUNT(*) INTO cnt_kpis        FROM public.kpis;
  SELECT COUNT(*) INTO cnt_objectives  FROM public.objectives;
  SELECT COUNT(*) INTO cnt_tasks       FROM public.tasks;
  SELECT COUNT(*) INTO cnt_checkins    FROM public.checkins;

  RAISE NOTICE '— A BORRAR —';
  RAISE NOTICE '  auth.users (otros): %', cnt_other_users;
  RAISE NOTICE '  kpis: %', cnt_kpis;
  RAISE NOTICE '  objectives: %', cnt_objectives;
  RAISE NOTICE '  tasks: %', cnt_tasks;
  RAISE NOTICE '  checkins: %', cnt_checkins;

  -- 1) Timeline primero (hang off kpis/objectives/tasks/users).
  DELETE FROM public.checkin_entries;
  DELETE FROM public.checkins;
  DELETE FROM public.progress_logs;
  DELETE FROM public.comments;

  -- 2) Junctions OKR.
  DELETE FROM public.kpi_objectives;
  DELETE FROM public.kpi_departments;
  DELETE FROM public.objective_departments;

  -- 3) Tasks, objectives, kpis (orden FK).
  DELETE FROM public.tasks;
  DELETE FROM public.objectives;
  DELETE FROM public.kpis;

  -- 4) Ruido per-user.
  --    notifications y email_logs son tablas de log: cualquier fila
  --    que sobreviva apunta a objetivos/usuarios que acabamos de
  --    borrar, así que se vacían completas. (Además `email_logs`
  --    puede no tener columna `user_id` en producción a pesar de lo
  --    que diga el tipo — filtrarla por user_id revienta el script.)
  DELETE FROM public.notifications;
  DELETE FROM public.email_logs;
  DELETE FROM public.user_departments WHERE user_id <> KEEP_USER_ID;
  DELETE FROM public.user_workspaces  WHERE user_id <> KEEP_USER_ID;
  DELETE FROM public.profiles         WHERE id      <> KEEP_USER_ID;

  -- 5) auth.users al final. ON DELETE CASCADE arrastra cualquier
  --    residuo (password_reset_audits.target_user_id, etc.).
  DELETE FROM auth.users WHERE id <> KEEP_USER_ID;

  -- Snapshot DESPUÉS (debería quedar 1/1/0/0/0/0)
  RAISE NOTICE '— QUEDAN —';
  RAISE NOTICE '  auth.users: %',      (SELECT COUNT(*) FROM auth.users);
  RAISE NOTICE '  profiles: %',        (SELECT COUNT(*) FROM public.profiles);
  RAISE NOTICE '  user_workspaces: %', (SELECT COUNT(*) FROM public.user_workspaces);
  RAISE NOTICE '  kpis: %',            (SELECT COUNT(*) FROM public.kpis);
  RAISE NOTICE '  objectives: %',      (SELECT COUNT(*) FROM public.objectives);
  RAISE NOTICE '  tasks: %',           (SELECT COUNT(*) FROM public.tasks);
  RAISE NOTICE '  checkins: %',        (SELECT COUNT(*) FROM public.checkins);

  IF DRY_RUN THEN
    RAISE EXCEPTION 'DRY_RUN activo — nada persistió. Revisa los NOTICE arriba. Si cuadran, cambia DRY_RUN := false y vuelve a correr.';
  END IF;
END $$;
