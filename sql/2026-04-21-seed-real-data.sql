-- ============================================================
-- SEED REAL DATA (post-cleanse)
-- ============================================================
--
-- Siembra 16 KPIs y ~55 objetivos desde los screenshots de
-- Asana. Corre DESPUÉS de 2026-04-21-data-cleanse.sql.
--
-- Defaults aplicados:
--   - status de objetivos: 'in_progress'
--   - start_date: CURRENT_DATE (hoy)
--   - end_date: 2026-05-31 (fin del próximo mes)
--   - created_by: el único usuario en auth.users
--   - responsible_department_id: primer tag del objetivo
--   - sort_order de KPIs: orden de los screenshots
--
-- Títulos cortados en las imágenes (completados por aproximación
-- -- ajusta en el UI si adiviné mal):
--   - "Ventagio: ... plataforma de Beneficios y..."
--   - "Incluir datos de BSC ... quincenalmente de forma..."
--   - "Devlyn - Optimizar consulta ... (ahora esta muy..."
--
-- Idempotencia: el script aborta si ya existen KPIs en el
-- workspace/period activo.

DO $$
DECLARE
  ws_id        uuid;
  v_period_id uuid;
  keep_user_id uuid;

  dept_biz  uuid;
  dept_prod uuid;
  dept_dev  uuid;
  dept_ops  uuid;
  dept_dis  uuid;

  v_kpi_id uuid;
  v_obj_id uuid;
  v_title  text;
  v_depts  uuid[];

  c_kpis       integer := 0;
  c_objectives integer := 0;

  end_date_default constant date := '2026-05-31';
BEGIN
  -- --- Lookups -----------------------------------------------
  SELECT id INTO keep_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF keep_user_id IS NULL THEN
    RAISE EXCEPTION 'No hay usuarios en auth.users. Crea tu usuario primero.';
  END IF;

  SELECT id INTO ws_id FROM public.workspaces ORDER BY created_at LIMIT 1;
  IF ws_id IS NULL THEN
    RAISE EXCEPTION 'No hay workspaces.';
  END IF;

  SELECT id INTO v_period_id
    FROM public.periods
    WHERE workspace_id = ws_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;
  IF v_period_id IS NULL THEN
    SELECT id INTO v_period_id
      FROM public.periods
      WHERE workspace_id = ws_id
      ORDER BY created_at DESC
      LIMIT 1;
  END IF;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No hay period para el workspace %.', ws_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.kpis WHERE workspace_id = ws_id AND period_id = v_period_id) THEN
    RAISE EXCEPTION 'Ya hay KPIs en este workspace/period. Corre el cleanse primero o borra manualmente.';
  END IF;

  -- Departamentos: resuelve por nombre, crea los que falten.
  SELECT id INTO dept_biz  FROM public.departments WHERE workspace_id = ws_id AND name = 'BIZ';
  SELECT id INTO dept_prod FROM public.departments WHERE workspace_id = ws_id AND name = 'PROD';
  SELECT id INTO dept_dev  FROM public.departments WHERE workspace_id = ws_id AND name = 'DEV';
  SELECT id INTO dept_ops  FROM public.departments WHERE workspace_id = ws_id AND name = 'OPS';
  SELECT id INTO dept_dis  FROM public.departments WHERE workspace_id = ws_id AND name = 'DISEÑO';

  IF dept_biz IS NULL THEN
    INSERT INTO public.departments(workspace_id, name, color) VALUES(ws_id, 'BIZ', '#EEC200') RETURNING id INTO dept_biz;
  END IF;
  IF dept_prod IS NULL THEN
    INSERT INTO public.departments(workspace_id, name, color) VALUES(ws_id, 'PROD', '#DE3618') RETURNING id INTO dept_prod;
  END IF;
  IF dept_dev IS NULL THEN
    INSERT INTO public.departments(workspace_id, name, color) VALUES(ws_id, 'DEV', '#50B83C') RETURNING id INTO dept_dev;
  END IF;
  IF dept_ops IS NULL THEN
    INSERT INTO public.departments(workspace_id, name, color) VALUES(ws_id, 'OPS', '#F49342') RETURNING id INTO dept_ops;
  END IF;
  IF dept_dis IS NULL THEN
    INSERT INTO public.departments(workspace_id, name, color) VALUES(ws_id, 'DISEÑO', '#9C6ADE') RETURNING id INTO dept_dis;
  END IF;

  -- --- KPI 0: Automatizar operaciones manuales ---------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'Automatizar operaciones manuales', 100, 0, '%', 0, 'manual', 0)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Automatizacion de archivos HSBC',                                 ARRAY[dept_dev]::uuid[]),
    ('Automatizacion de proc devlyn pt2',                               ARRAY[dept_dev]::uuid[]),
    ('No aplica --- Carga de archivo ATM de Roberto a Uriel',           ARRAY[dept_dev, dept_dis, dept_biz]::uuid[]),
    ('Automatizar el alta y baja de users HSBC',                        ARRAY[dept_dev, dept_prod]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 1: CIERRE BSC -------------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'CIERRE BSC', 100, 0, '%', 0, 'manual', 1)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Transicion de Banco Santa Cruz a Val', ARRAY[dept_prod, dept_ops]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 2: CUSTOMER ENGAGEMENT HSBC -----------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'CUSTOMER ENGAGEMENT HSBC', 100, 0, '%', 0, 'manual', 2)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Habilitar redireccion de altas nuevas',                                            ARRAY[dept_ops, dept_biz]::uuid[]),
    ('Conseguir Dominio de @hsbc.com',                                                   ARRAY[dept_biz]::uuid[]),
    ('Flujo para tarjetas de debito incentivando vinculación en ecosistema HSBC',        ARRAY[dept_dis, dept_biz]::uuid[]),
    ('Gamificacion Fase 2 con Compra de Certificado',                                    ARRAY[dept_biz]::uuid[]),
    ('Maraton de Viajes',                                                                ARRAY[]::uuid[]),
    ('Flujo de bienvenida Inbound para Viva insta + perso',                              ARRAY[]::uuid[]),
    ('Nueva pieza de Emitido pre envío de tarjetas',                                     ARRAY[]::uuid[]),
    ('Flujo para actualización de direccion para Renovaciones (3 meses antes)',          ARRAY[]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 3: CYBERSEC ---------------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'CYBERSEC', 100, 0, '%', 0, 'manual', 3)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Prueba de Phishing este año',            ARRAY[dept_ops]::uuid[]),
    ('Prueba de Pentesting',                   ARRAY[dept_ops]::uuid[]),
    ('Cuestionario para URL de HSBC',          ARRAY[dept_ops]::uuid[]),
    ('SGSI sistema de gestión de seguridad',   ARRAY[dept_ops]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 4: DESFACE NOTIFICACIONES -------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'DESFACE NOTIFICACIONES', 100, 0, '%', 0, 'manual', 4)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Integracion EXACT',                                                                  ARRAY[]::uuid[]),
    ('Detectar/Actualizar nuevo courier asignado usando archivo de guias_carga',           ARRAY[dept_dev, dept_ops, dept_biz]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 5: DEUDA TECNICA DEV ------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'DEUDA TECNICA DEV', 100, 0, '%', 0, 'manual', 5)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Revision a mejoras a Scrappers',                               ARRAY[dept_dev]::uuid[]),
    ('Limpieza de Triggers',                                         ARRAY[dept_dev]::uuid[]),
    ('Contratar Desarrollador',                                      ARRAY[dept_dev]::uuid[]),
    ('Limpieza de Themes',                                           ARRAY[dept_dev, dept_dis]::uuid[]),
    ('Terminar actualizacion de Rails',                              ARRAY[dept_dev]::uuid[]),
    ('Soporte para mismo numero de guia en distintos workspaces',    ARRAY[dept_dev]::uuid[]),
    -- NOTA: título cortado en la imagen ("(ahora esta muy..."). Ajusta en el UI.
    ('Devlyn - Optimizar consulta de multiples precios a nivel api', ARRAY[dept_dev]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 6: Iniciativas NEGOCIO ----------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'Iniciativas NEGOCIO', 100, 0, '%', 0, 'manual', 6)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('HSBC - Implementar Kublau con HSBC GPS',                                           ARRAY[dept_biz]::uuid[]),
    ('Visa - Retomar conversacion con Partners de Visa en CAMerica',                     ARRAY[dept_biz]::uuid[]),
    ('Firmar renovación de contrato',                                                    ARRAY[dept_biz]::uuid[]),
    ('Identificar productos individuales vendibles de Kublau (API, CURP, mensajería)',   ARRAY[dept_prod, dept_biz]::uuid[]),
    -- NOTA: título cortado en la imagen ("...Beneficios y..."). Ajusta en el UI.
    ('Ventagio: Colocación de tarjetas World Elite con plataforma de Beneficios',        ARRAY[]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 7: MAS FACTURACION HSBC ---------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'MAS FACTURACION HSBC', 100, 0, '%', 0, 'manual', 7)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Incluir tarjetas instantaneas de credito y debito', ARRAY[dept_biz]::uuid[]),
    ('Proyecto Toluca',                                   ARRAY[dept_biz]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 8: MEJORAS Servicio ofrecido a Clientes -----------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'MEJORAS Servicio ofrecido a Clientes', 100, 0, '%', 0, 'manual', 8)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Cambiar nombre de Rastreo.kublau.com a HSBC',                ARRAY[dept_ops, dept_biz]::uuid[]),
    ('CC - Revision para renovacion de flujo de llamadas con clientes', ARRAY[dept_dev, dept_prod]::uuid[]),
    ('Traer a rastreo los filtros que se cargan al momento',       ARRAY[dept_dev, dept_prod]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 9: MEJORAS INTERNAS -------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'MEJORAS INTERNAS', 100, 0, '%', 0, 'manual', 9)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Implementar Cambios al diseñador y mejoras', ARRAY[dept_dev]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 10: MEJORAS PROCESO PRODUCTO ----------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'MEJORAS PROCESO PRODUCTO', 100, 0, '%', 0, 'manual', 10)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Nuevo proceso para aprobacion de tasks',      ARRAY[dept_prod]::uuid[]),
    ('Agendar sesiones de Kudos cada 2 weeklys',    ARRAY[dept_prod]::uuid[]),
    ('Conciliacion INDIVIDUAL de Facturación',      ARRAY[dept_biz]::uuid[]),
    ('Limpieza de Blazers',                         ARRAY[dept_dev, dept_prod]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 11: METRICAS OPERACIÓN ----------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'METRICAS OPERACIÓN', 100, 0, '%', 0, 'manual', 11)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Encuesta de percepcion de calidad de servicio con cliente',       ARRAY[dept_ops, dept_dis]::uuid[]),
    -- NOTA: título cortado en la imagen ("...quincenalmente de forma..."). Ajusta en el UI.
    ('Incluir datos de BSC en las métricas monitoreadas quincenalmente', ARRAY[dept_prod, dept_ops]::uuid[]),
    ('OPS - Analizar y elegir reportes beneficiosos para BSC',          ARRAY[]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 12: NOTIFICACIONES --------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'NOTIFICACIONES', 100, 0, '%', 0, 'manual', 12)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Revision de Campaña de Activacion de BSC',         ARRAY[dept_prod]::uuid[]),
    ('Otros flujos de otros productos de Notis BSC',     ARRAY[dept_prod]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 13: Producto --------------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'Producto', 100, 0, '%', 0, 'manual', 13)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Seleccionar otra vertical para Kublau',            ARRAY[dept_prod]::uuid[]),
    ('Encontrar aplicaciones de AI para Kublau',         ARRAY[dept_prod]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 14: Negocio ---------------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'Negocio', 100, 0, '%', 0, 'manual', 14)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Revivir Landing de Kublau',             ARRAY[dept_biz]::uuid[]),
    ('Contratar a alguien de Finanzas',       ARRAY[dept_biz]::uuid[]),
    ('Contrar a alguien de KAM',              ARRAY[dept_biz]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  -- --- KPI 15: RRHH ------------------------------------------
  INSERT INTO public.kpis(workspace_id, period_id, title, target_value, current_value, unit, manual_progress, progress_mode, sort_order)
    VALUES(ws_id, v_period_id, 'RRHH', 100, 0, '%', 0, 'manual', 15)
    RETURNING id INTO v_kpi_id;
  c_kpis := c_kpis + 1;

  FOR v_title, v_depts IN SELECT * FROM (VALUES
    ('Transición a trabajo Híbrida',                                 ARRAY[dept_prod, dept_ops, dept_biz]::uuid[]),
    ('Actividades fisicas no de trabajo (juegos, hikes, etc)',       ARRAY[dept_prod, dept_ops, dept_biz]::uuid[]),
    ('Ver a uriel este año',                                         ARRAY[dept_prod, dept_ops, dept_biz]::uuid[]),
    ('Visitar a Uriel',                                              ARRAY[dept_prod, dept_ops, dept_biz]::uuid[])
  ) AS t(title, depts)
  LOOP
    INSERT INTO public.objectives(workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id, start_date, end_date)
      VALUES(ws_id, v_period_id, v_title, 'in_progress', 0, 'manual', v_depts[1], CURRENT_DATE, end_date_default)
      RETURNING id INTO v_obj_id;
    INSERT INTO public.kpi_objectives(kpi_id, objective_id) VALUES(v_kpi_id, v_obj_id);
    IF array_length(v_depts, 1) > 0 THEN
      INSERT INTO public.objective_departments(objective_id, department_id)
        SELECT v_obj_id, unnest(v_depts);
    END IF;
    c_objectives := c_objectives + 1;
  END LOOP;

  RAISE NOTICE 'Seed completo. KPIs insertados: %. Objetivos insertados: %.', c_kpis, c_objectives;
END $$;
