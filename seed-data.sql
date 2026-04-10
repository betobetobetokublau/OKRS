-- ============================================
-- SEED DATA: KPIs + Objectives from Asana screenshots
-- Run in Supabase SQL Editor
-- ============================================

-- Get workspace and period references
DO $$
DECLARE
  ws_id UUID;
  period_id UUID;
  -- Department IDs
  dept_biz UUID;
  dept_prod UUID;
  dept_dev UUID;
  dept_ops UUID;
  dept_diseno UUID;
  -- KPI IDs
  kpi_iniciativas UUID;
  kpi_facturacion UUID;
  kpi_servicio UUID;
  kpi_proceso UUID;
  kpi_metricas UUID;
  kpi_engagement UUID;
  kpi_cybersec UUID;
BEGIN
  -- Get workspace
  SELECT id INTO ws_id FROM workspaces WHERE slug = 'kublau';

  -- Get active period (or first period)
  SELECT id INTO period_id FROM periods WHERE workspace_id = ws_id AND status = 'active' LIMIT 1;
  IF period_id IS NULL THEN
    SELECT id INTO period_id FROM periods WHERE workspace_id = ws_id ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- ==========================================
  -- 1. CREATE DEPARTMENTS
  -- ==========================================
  INSERT INTO departments (id, workspace_id, name, color) VALUES
    (gen_random_uuid(), ws_id, 'BIZ', '#EEC200')
  RETURNING id INTO dept_biz;

  INSERT INTO departments (id, workspace_id, name, color) VALUES
    (gen_random_uuid(), ws_id, 'PROD', '#DE3618')
  RETURNING id INTO dept_prod;

  INSERT INTO departments (id, workspace_id, name, color) VALUES
    (gen_random_uuid(), ws_id, 'DEV', '#50B83C')
  RETURNING id INTO dept_dev;

  INSERT INTO departments (id, workspace_id, name, color) VALUES
    (gen_random_uuid(), ws_id, 'OPS', '#F49342')
  RETURNING id INTO dept_ops;

  INSERT INTO departments (id, workspace_id, name, color) VALUES
    (gen_random_uuid(), ws_id, 'DISEÑO', '#9C6ADE')
  RETURNING id INTO dept_diseno;

  -- ==========================================
  -- 2. CREATE KPIs
  -- ==========================================

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'Iniciativas NEGOCIO', 'Iniciativas estratégicas de negocio y alianzas comerciales', 100, 20, '%', 20, 'manual')
  RETURNING id INTO kpi_iniciativas;

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'MAS FACTURACION HSBC', 'Incrementar facturación con HSBC mediante nuevos productos y servicios', 100, 10, '%', 10, 'manual')
  RETURNING id INTO kpi_facturacion;

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'MEJORAS Servicio ofrecido a Clientes', 'Mejorar la calidad del servicio y herramientas de atención al cliente', 100, 45, '%', 45, 'manual')
  RETURNING id INTO kpi_servicio;

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'MEJORAS PROCESO PRODUCTO', 'Optimizar procesos internos del equipo de producto', 100, 70, '%', 70, 'manual')
  RETURNING id INTO kpi_proceso;

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'METRICAS OPERACIÓN', 'Establecer y monitorear métricas operativas clave', 100, 35, '%', 35, 'manual')
  RETURNING id INTO kpi_metricas;

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'CUSTOMER ENGAGEMENT HSBC', 'Aumentar engagement y activación de clientes HSBC', 100, 40, '%', 40, 'manual')
  RETURNING id INTO kpi_engagement;

  INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode)
  VALUES (gen_random_uuid(), ws_id, period_id, 'CYBERSEC', 'Cumplimiento de seguridad informática y evaluaciones de riesgo', 100, 55, '%', 55, 'manual')
  RETURNING id INTO kpi_cybersec;

  -- Link KPIs to departments
  INSERT INTO kpi_departments (kpi_id, department_id) VALUES
    (kpi_iniciativas, dept_biz),
    (kpi_facturacion, dept_biz),
    (kpi_servicio, dept_ops),
    (kpi_servicio, dept_dev),
    (kpi_proceso, dept_prod),
    (kpi_metricas, dept_ops),
    (kpi_metricas, dept_prod),
    (kpi_engagement, dept_biz),
    (kpi_engagement, dept_diseno),
    (kpi_engagement, dept_ops),
    (kpi_cybersec, dept_ops);

  -- ==========================================
  -- 3. CREATE OBJECTIVES + TASKS
  -- ==========================================

  -- Helper: we'll create objectives and their tasks inline

  -- -----------------------------------------------
  -- KPI: Iniciativas NEGOCIO
  -- -----------------------------------------------
  DECLARE obj_id UUID;
  BEGIN
    -- Obj 1: HSBC - Implementar Kublau con HSBC GPS
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'HSBC - Implementar Kublau con HSBC GPS', 'in_progress', 15, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_iniciativas, obj_id);

    -- Obj 2: Visa - Retomar conversacion con Partners de Visa en CAMerica
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Visa - Retomar conversación con Partners de Visa en CAMerica', 'in_progress', 10, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_iniciativas, obj_id);

    -- Obj 3: Firmar renovación de contrato
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Firmar renovación de contrato', 'in_progress', 25, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_iniciativas, obj_id);

    -- Obj 4: Identificar productos individuales vendibles de Kublau (API, CURP, mensajería)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Identificar productos individuales vendibles de Kublau (API, CURP, mensajería)', 'in_progress', 10, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_iniciativas, obj_id);

    -- Obj 5: Ventagio: Colocación de tarjetas World Elite con plataforma de Beneficios
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Ventagio: Colocación de tarjetas World Elite con plataforma de Beneficios', 'in_progress', 5, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_iniciativas, obj_id);

    -- -----------------------------------------------
    -- KPI: MAS FACTURACION HSBC
    -- -----------------------------------------------

    -- Obj: Incluir tarjetas instantáneas de crédito y débito (BLOCKED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Incluir tarjetas instantáneas de crédito y débito', 'in_progress', 10, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_facturacion, obj_id);
    -- Add a blocked task
    INSERT INTO tasks (objective_id, title, status, block_reason) VALUES
      (obj_id, 'Incluir tarjetas instantáneas de crédito y débito', 'blocked', 'Dependencia de HSBC para habilitar el servicio');

    -- Obj: Proyecto Toluca
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Proyecto Toluca', 'in_progress', 5, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_facturacion, obj_id);

    -- -----------------------------------------------
    -- KPI: MEJORAS Servicio ofrecido a Clientes
    -- -----------------------------------------------

    -- Obj: Cambiar nombre de Rastreo.kublau.com a HSBC
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Cambiar nombre de Rastreo.kublau.com a HSBC', 'in_progress', 20, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_servicio, obj_id);

    -- Obj: CC - Cambio para búsqueda veloz (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'CC - Cambio para búsqueda veloz', 'deprecated', 100, 'manual', dept_dev)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_dev);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_servicio, obj_id);

    -- Obj: CC - Seguimiento a manuales (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'CC - Seguimiento a manuales', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_servicio, obj_id);

    -- Obj: CC - Revisión para renovación de flujo de llamadas con clientes
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'CC - Revisión para renovación de flujo de llamadas con clientes', 'in_progress', 30, 'manual', dept_dev)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_dev);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_servicio, obj_id);

    -- Obj: Traer a rastreo los filtros que se cargan al momento
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Traer a rastreo los filtros que se cargan al momento', 'in_progress', 15, 'manual', dept_dev)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_dev);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_servicio, obj_id);

    -- -----------------------------------------------
    -- KPI: MEJORAS PROCESO PRODUCTO
    -- -----------------------------------------------

    -- Obj: Establecer templates para tasks de asana (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Establecer templates para tasks de Asana', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Nuevo proceso para aprobación de tasks
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Nuevo proceso para aprobación de tasks', 'in_progress', 40, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Agendar sesiones de Kudos cada 2 weeklys
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Agendar sesiones de Kudos cada 2 weeklys', 'in_progress', 50, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Agendar sesiones de comida virtual Kublau (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Agendar sesiones de comida virtual Kublau', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Llevar Bitácora de cambios en producto y dev (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Llevar Bitácora de cambios en producto y dev', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Quitar a Roberto de emails de alerta que no significan nada (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Quitar a Roberto de emails de alerta que no significan nada', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Quitar Alertas que no significan nada de las 11 de AppSignal (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Quitar Alertas que no significan nada de las 11 de AppSignal', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Conciliación INDIVIDUAL de Facturación
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Conciliación INDIVIDUAL de Facturación', 'in_progress', 30, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Implementar medición de objetivos de la Empresa (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Implementar medición de objetivos de la Empresa', 'deprecated', 100, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- Obj: Limpieza de Blazers
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Limpieza de Blazers', 'in_progress', 20, 'manual', dept_dev)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_dev);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_proceso, obj_id);

    -- -----------------------------------------------
    -- KPI: METRICAS OPERACIÓN
    -- -----------------------------------------------

    -- Obj: Encuesta de percepción de calidad de servicio con cliente
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Encuesta de percepción de calidad de servicio con cliente', 'in_progress', 25, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_metricas, obj_id);

    -- Obj: Incluir datos de BSC en las métricas monitoreadas quincenalmente
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Incluir datos de BSC en las métricas monitoreadas quincenalmente', 'in_progress', 30, 'manual', dept_prod)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_prod);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_metricas, obj_id);

    -- Obj: OPS - Analizar y elegir reportes beneficiosos para BSC / HSBC
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'OPS - Analizar y elegir reportes beneficiosos para BSC / HSBC de info actual', 'in_progress', 40, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_metricas, obj_id);

    -- Obj: OPS - Analizar y elegir reportes beneficiosos para BSC
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'OPS - Analizar y elegir reportes beneficiosos para BSC', 'in_progress', 20, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_metricas, obj_id);

    -- Obj: Estandarizar reportes de Notificaciones (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Estandarizar reportes de Notificaciones', 'deprecated', 100, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_metricas, obj_id);

    -- -----------------------------------------------
    -- KPI: CUSTOMER ENGAGEMENT HSBC
    -- -----------------------------------------------

    -- Obj: Habilitar redirección de altas nuevas
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Habilitar redirección de altas nuevas', 'in_progress', 30, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Centralizar las campañas (todo lo que genere LEAD) actual
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Centralizar las campañas (todo lo que genere LEAD) actual', 'in_progress', 35, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Monitorear performance de campañas de LEADS (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Monitorear performance de campañas de LEADS', 'deprecated', 100, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Conseguir Dominio de @hsbc.com
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Conseguir Dominio de @hsbc.com', 'in_progress', 15, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Enfoque en Activación: Gamificación con cupones Starbucks y Amazon (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Enfoque en Activación: Gamificación con cupones Starbucks y Amazon', 'deprecated', 100, 'manual', dept_diseno)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_diseno);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Campaña BB sin registro en promomas (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Campaña BB sin registro en promomas', 'deprecated', 100, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Flujo para tarjetas de débito incentivando vinculación en ecosistema HSBC
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Flujo para tarjetas de débito incentivando vinculación en ecosistema HSBC', 'in_progress', 25, 'manual', dept_diseno)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_diseno);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Gamificación Fase 2 con Compra de Certificado
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Gamificación Fase 2 con Compra de Certificado', 'in_progress', 20, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_biz);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Maratón de Viajes
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Maratón de Viajes', 'upcoming', 0, 'manual', dept_biz)
    RETURNING id INTO obj_id;
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Flujo de bienvenida Inbound para Viva insta + perso
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Flujo de bienvenida Inbound para Viva insta + perso', 'upcoming', 0, 'manual', dept_diseno)
    RETURNING id INTO obj_id;
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Nueva pieza de Emitido pre envío de tarjetas
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Nueva pieza de Emitido pre envío de tarjetas', 'upcoming', 0, 'manual', dept_diseno)
    RETURNING id INTO obj_id;
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- Obj: Flujo para actualización de dirección para Renovaciones (3 meses antes)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Flujo para actualización de dirección para Renovaciones (3 meses antes)', 'upcoming', 0, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_engagement, obj_id);

    -- -----------------------------------------------
    -- KPI: CYBERSEC
    -- -----------------------------------------------

    -- Obj: Evaluación cybersec (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Evaluación cybersec', 'deprecated', 100, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

    -- Obj: Cambios Previos a Evaluación (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Cambios Previos a Evaluación', 'deprecated', 100, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

    -- Obj: Remediaciones resultantes de la evaluación de Marzo (COMPLETED)
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Remediaciones resultantes de la evaluación de Marzo', 'deprecated', 100, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

    -- Obj: Prueba de Phishing este año
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Prueba de Phishing este año', 'in_progress', 10, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

    -- Obj: Prueba de Pentesting
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Prueba de Pentesting', 'upcoming', 0, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

    -- Obj: Cuestionario para URL de HSBC
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'Cuestionario para URL de HSBC', 'upcoming', 0, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

    -- Obj: SGSI sistema de gestión de seguridad
    INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id)
    VALUES (gen_random_uuid(), ws_id, period_id, 'SGSI sistema de gestión de seguridad', 'in_progress', 15, 'manual', dept_ops)
    RETURNING id INTO obj_id;
    INSERT INTO objective_departments (objective_id, department_id) VALUES (obj_id, dept_ops);
    INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES (kpi_cybersec, obj_id);

  END;
END $$;
