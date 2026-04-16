-- Add manually-editable `status` column to KPIs.
-- Before this migration, KPI status was a read-only chip derived from progress.
-- Now managers/admins can set it explicitly (Asana-style health indicator).
--
-- Allowed values:
--   on_track  — progress is healthy vs. plan (default)
--   at_risk   — progress is slipping; needs attention
--   off_track — progress is materially behind plan
--   achieved  — target has been met
--
-- Run once against the live Supabase DB, then restart the app.

ALTER TABLE kpis
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'on_track';

ALTER TABLE kpis
  DROP CONSTRAINT IF EXISTS kpis_status_check;

ALTER TABLE kpis
  ADD CONSTRAINT kpis_status_check
  CHECK (status IN ('on_track', 'at_risk', 'off_track', 'achieved'));

CREATE INDEX IF NOT EXISTS kpis_status_idx ON kpis (status);

-- Backfill: existing rows already have the default 'on_track' from the ADD COLUMN.
-- Managers can reclassify at-risk / off-track / achieved KPIs from the UI.

NOTIFY pgrst, 'reload schema';
