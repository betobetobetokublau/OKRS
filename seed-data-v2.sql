-- ============================================
-- SEED DATA v2: Plain INSERTs (no PL/pgSQL)
-- Workspace: 00000000-0000-0000-0000-000000000001
-- Period:    13852d86-be39-4280-8db7-7115f6cbeeb6
-- ============================================

-- ==========================================
-- 1. DEPARTMENTS
-- ==========================================
INSERT INTO departments (id, workspace_id, name, color) VALUES
  ('aaaaaaaa-0001-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'BIZ', '#EEC200'),
  ('aaaaaaaa-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'PROD', '#DE3618'),
  ('aaaaaaaa-0003-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'DEV', '#50B83C'),
  ('aaaaaaaa-0004-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'OPS', '#F49342'),
  ('aaaaaaaa-0005-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'DISEÑO', '#9C6ADE');

-- ==========================================
-- 2. KPIs
-- ==========================================
INSERT INTO kpis (id, workspace_id, period_id, title, description, target_value, current_value, unit, manual_progress, progress_mode) VALUES
  ('bbbbbbbb-0001-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Iniciativas NEGOCIO', 'Iniciativas estratégicas de negocio y alianzas comerciales', 100, 20, '%', 20, 'manual'),
  ('bbbbbbbb-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'MAS FACTURACION HSBC', 'Incrementar facturación con HSBC mediante nuevos productos', 100, 10, '%', 10, 'manual'),
  ('bbbbbbbb-0003-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'MEJORAS Servicio ofrecido a Clientes', 'Mejorar calidad del servicio y herramientas de atención', 100, 45, '%', 45, 'manual'),
  ('bbbbbbbb-0004-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'MEJORAS PROCESO PRODUCTO', 'Optimizar procesos internos del equipo de producto', 100, 70, '%', 70, 'manual'),
  ('bbbbbbbb-0005-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'METRICAS OPERACIÓN', 'Establecer y monitorear métricas operativas clave', 100, 35, '%', 35, 'manual'),
  ('bbbbbbbb-0006-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'CUSTOMER ENGAGEMENT HSBC', 'Aumentar engagement y activación de clientes HSBC', 100, 40, '%', 40, 'manual'),
  ('bbbbbbbb-0007-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'CYBERSEC', 'Cumplimiento de seguridad informática y evaluaciones', 100, 55, '%', 55, 'manual');

-- ==========================================
-- 3. KPI ↔ DEPARTMENT links
-- ==========================================
INSERT INTO kpi_departments (kpi_id, department_id) VALUES
  ('bbbbbbbb-0001-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('bbbbbbbb-0002-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('bbbbbbbb-0005-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('bbbbbbbb-0005-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001');

-- ==========================================
-- 4. OBJECTIVES
-- ==========================================

-- --- KPI: Iniciativas NEGOCIO ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0001-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'HSBC - Implementar Kublau con HSBC GPS', 'in_progress', 15, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Visa - Retomar conversación con Partners de Visa en CAMerica', 'in_progress', 10, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0003-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Firmar renovación de contrato', 'in_progress', 25, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0004-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Identificar productos individuales vendibles de Kublau (API, CURP, mensajería)', 'in_progress', 10, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0005-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Ventagio: Colocación de tarjetas World Elite con plataforma de Beneficios', 'in_progress', 5, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001');

-- --- KPI: MAS FACTURACION HSBC ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0006-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Incluir tarjetas instantáneas de crédito y débito', 'in_progress', 10, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0007-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Proyecto Toluca', 'in_progress', 5, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001');

-- --- KPI: MEJORAS Servicio ofrecido a Clientes ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0008-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Cambiar nombre de Rastreo.kublau.com a HSBC', 'in_progress', 20, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0009-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'CC - Cambio para búsqueda veloz', 'deprecated', 100, 'manual', 'aaaaaaaa-0003-0000-0000-000000000001'),
  ('cccccccc-0010-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'CC - Seguimiento a manuales', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0011-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'CC - Revisión para renovación de flujo de llamadas con clientes', 'in_progress', 30, 'manual', 'aaaaaaaa-0003-0000-0000-000000000001'),
  ('cccccccc-0012-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Traer a rastreo los filtros que se cargan al momento', 'in_progress', 15, 'manual', 'aaaaaaaa-0003-0000-0000-000000000001');

-- --- KPI: MEJORAS PROCESO PRODUCTO ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0013-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Establecer templates para tasks de Asana', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0014-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Nuevo proceso para aprobación de tasks', 'in_progress', 40, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0015-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Agendar sesiones de Kudos cada 2 weeklys', 'in_progress', 50, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0016-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Agendar sesiones de comida virtual Kublau', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0017-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Llevar Bitácora de cambios en producto y dev', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0018-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Quitar a Roberto de emails de alerta que no significan nada', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0019-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Quitar Alertas que no significan nada de las 11 de AppSignal', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0020-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Conciliación INDIVIDUAL de Facturación', 'in_progress', 30, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0021-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Implementar medición de objetivos de la Empresa', 'deprecated', 100, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0022-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Limpieza de Blazers', 'in_progress', 20, 'manual', 'aaaaaaaa-0003-0000-0000-000000000001');

-- --- KPI: METRICAS OPERACIÓN ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0023-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Encuesta de percepción de calidad de servicio con cliente', 'in_progress', 25, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0024-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Incluir datos de BSC en las métricas monitoreadas quincenalmente', 'in_progress', 30, 'manual', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0025-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'OPS - Analizar y elegir reportes beneficiosos para BSC / HSBC de info actual', 'in_progress', 40, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0026-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'OPS - Analizar y elegir reportes beneficiosos para BSC', 'in_progress', 20, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0027-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Estandarizar reportes de Notificaciones', 'deprecated', 100, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001');

-- --- KPI: CUSTOMER ENGAGEMENT HSBC ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0028-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Habilitar redirección de altas nuevas', 'in_progress', 30, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0029-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Centralizar las campañas (todo lo que genere LEAD) actual', 'in_progress', 35, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0030-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Monitorear performance de campañas de LEADS', 'deprecated', 100, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0031-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Conseguir Dominio de @hsbc.com', 'in_progress', 15, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0032-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Enfoque en Activación: Gamificación con cupones Starbucks y Amazon', 'deprecated', 100, 'manual', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('cccccccc-0033-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Campaña BB sin registro en promomas', 'deprecated', 100, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0034-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Flujo para tarjetas de débito incentivando vinculación en ecosistema HSBC', 'in_progress', 25, 'manual', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('cccccccc-0035-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Gamificación Fase 2 con Compra de Certificado', 'in_progress', 20, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0036-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Maratón de Viajes', 'upcoming', 0, 'manual', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0037-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Flujo de bienvenida Inbound para Viva insta + perso', 'upcoming', 0, 'manual', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('cccccccc-0038-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Nueva pieza de Emitido pre envío de tarjetas', 'upcoming', 0, 'manual', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('cccccccc-0039-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Flujo para actualización de dirección para Renovaciones (3 meses antes)', 'upcoming', 0, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001');

-- --- KPI: CYBERSEC ---
INSERT INTO objectives (id, workspace_id, period_id, title, status, manual_progress, progress_mode, responsible_department_id) VALUES
  ('cccccccc-0040-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Evaluación cybersec', 'deprecated', 100, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0041-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Cambios Previos a Evaluación', 'deprecated', 100, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0042-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Remediaciones resultantes de la evaluación de Marzo', 'deprecated', 100, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0043-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Prueba de Phishing este año', 'in_progress', 10, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0044-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Prueba de Pentesting', 'upcoming', 0, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0045-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'Cuestionario para URL de HSBC', 'upcoming', 0, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0046-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '13852d86-be39-4280-8db7-7115f6cbeeb6', 'SGSI sistema de gestión de seguridad', 'in_progress', 15, 'manual', 'aaaaaaaa-0004-0000-0000-000000000001');

-- ==========================================
-- 5. KPI ↔ OBJECTIVE links
-- ==========================================
INSERT INTO kpi_objectives (kpi_id, objective_id) VALUES
  -- Iniciativas NEGOCIO
  ('bbbbbbbb-0001-0000-0000-000000000001', 'cccccccc-0001-0000-0000-000000000001'),
  ('bbbbbbbb-0001-0000-0000-000000000001', 'cccccccc-0002-0000-0000-000000000001'),
  ('bbbbbbbb-0001-0000-0000-000000000001', 'cccccccc-0003-0000-0000-000000000001'),
  ('bbbbbbbb-0001-0000-0000-000000000001', 'cccccccc-0004-0000-0000-000000000001'),
  ('bbbbbbbb-0001-0000-0000-000000000001', 'cccccccc-0005-0000-0000-000000000001'),
  -- MAS FACTURACION HSBC
  ('bbbbbbbb-0002-0000-0000-000000000001', 'cccccccc-0006-0000-0000-000000000001'),
  ('bbbbbbbb-0002-0000-0000-000000000001', 'cccccccc-0007-0000-0000-000000000001'),
  -- MEJORAS Servicio
  ('bbbbbbbb-0003-0000-0000-000000000001', 'cccccccc-0008-0000-0000-000000000001'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'cccccccc-0009-0000-0000-000000000001'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'cccccccc-0010-0000-0000-000000000001'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'cccccccc-0011-0000-0000-000000000001'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'cccccccc-0012-0000-0000-000000000001'),
  -- MEJORAS PROCESO PRODUCTO
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0013-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0014-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0015-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0016-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0017-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0018-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0019-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0020-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0021-0000-0000-000000000001'),
  ('bbbbbbbb-0004-0000-0000-000000000001', 'cccccccc-0022-0000-0000-000000000001'),
  -- METRICAS OPERACIÓN
  ('bbbbbbbb-0005-0000-0000-000000000001', 'cccccccc-0023-0000-0000-000000000001'),
  ('bbbbbbbb-0005-0000-0000-000000000001', 'cccccccc-0024-0000-0000-000000000001'),
  ('bbbbbbbb-0005-0000-0000-000000000001', 'cccccccc-0025-0000-0000-000000000001'),
  ('bbbbbbbb-0005-0000-0000-000000000001', 'cccccccc-0026-0000-0000-000000000001'),
  ('bbbbbbbb-0005-0000-0000-000000000001', 'cccccccc-0027-0000-0000-000000000001'),
  -- CUSTOMER ENGAGEMENT HSBC
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0028-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0029-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0030-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0031-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0032-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0033-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0034-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0035-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0036-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0037-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0038-0000-0000-000000000001'),
  ('bbbbbbbb-0006-0000-0000-000000000001', 'cccccccc-0039-0000-0000-000000000001'),
  -- CYBERSEC
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0040-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0041-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0042-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0043-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0044-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0045-0000-0000-000000000001'),
  ('bbbbbbbb-0007-0000-0000-000000000001', 'cccccccc-0046-0000-0000-000000000001');

-- ==========================================
-- 6. OBJECTIVE ↔ DEPARTMENT links
-- ==========================================
INSERT INTO objective_departments (objective_id, department_id) VALUES
  -- Iniciativas NEGOCIO
  ('cccccccc-0001-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0002-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0003-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0004-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0005-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  -- MAS FACTURACION HSBC
  ('cccccccc-0006-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0007-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  -- MEJORAS Servicio
  ('cccccccc-0008-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0009-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000001'),
  ('cccccccc-0010-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0011-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000001'),
  ('cccccccc-0012-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000001'),
  -- MEJORAS PROCESO PRODUCTO
  ('cccccccc-0013-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0014-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0015-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0016-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0017-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0018-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0019-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0020-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0021-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0022-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000001'),
  -- METRICAS OPERACIÓN
  ('cccccccc-0023-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0024-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001'),
  ('cccccccc-0025-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0026-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0027-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  -- CUSTOMER ENGAGEMENT HSBC
  ('cccccccc-0028-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0029-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0030-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0031-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0032-0000-0000-000000000001', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('cccccccc-0033-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  ('cccccccc-0034-0000-0000-000000000001', 'aaaaaaaa-0005-0000-0000-000000000001'),
  ('cccccccc-0035-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001'),
  -- CYBERSEC
  ('cccccccc-0040-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0041-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0042-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0043-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0044-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0045-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001'),
  ('cccccccc-0046-0000-0000-000000000001', 'aaaaaaaa-0004-0000-0000-000000000001');

-- ==========================================
-- 7. BLOCKED TASK
-- ==========================================
INSERT INTO tasks (objective_id, title, status, block_reason) VALUES
  ('cccccccc-0006-0000-0000-000000000001', 'Incluir tarjetas instantáneas de crédito y débito', 'blocked', 'Dependencia de HSBC para habilitar el servicio');
