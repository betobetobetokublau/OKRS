-- Add persistent sort order for KPIs.
-- Run once in the Supabase SQL Editor.

ALTER TABLE kpis
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill: within each (workspace_id, period_id), assign sort_order based on created_at.
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY workspace_id, period_id ORDER BY created_at ASC)) - 1 AS rn
  FROM kpis
)
UPDATE kpis
SET sort_order = ranked.rn
FROM ranked
WHERE kpis.id = ranked.id;

-- Helpful index for ordered reads.
CREATE INDEX IF NOT EXISTS kpis_sort_order_idx
  ON kpis (workspace_id, period_id, sort_order);

-- Reload PostgREST schema cache so clients see the new column immediately.
NOTIFY pgrst, 'reload schema';
