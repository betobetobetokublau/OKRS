-- ============================================================
-- CRON IDEMPOTENCY  (corrected)
-- ============================================================
-- Vercel retries cron handlers up to 3 times when they return 5xx
-- or time out. Without DB-side deduplication, every retry of
-- `/api/cron/recordatorios` re-sends emails and re-inserts the
-- same in-app notifications.
--
-- We dedup on (user, workspace, type/template, calendar-day).
--
-- Why a generated column instead of an expression index:
--   * `date_trunc('day', created_at)` on a timestamptz is only
--     STABLE (the day boundary depends on the session timezone),
--     so Postgres rejects it in an index expression with
--     "functions in index expression must be marked IMMUTABLE".
--   * `created_at AT TIME ZONE 'UTC'` (the TEXT-zone form) is ALSO
--     only STABLE — named zones can carry DST rules. The IMMUTABLE
--     form uses a fixed interval offset: `AT TIME ZONE INTERVAL '0'`.
--   * A plain column (not an expression index) is also the only
--     thing PostgREST/Supabase `onConflict` can reference, so the
--     route's `upsert({ onConflict, ignoreDuplicates })` works.
--
-- Idempotent. Safe to re-run.

-- ── notifications ───────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS created_day date
  GENERATED ALWAYS AS (((created_at AT TIME ZONE INTERVAL '0'))::date) STORED;

-- Collapse any pre-existing same-day duplicates, keeping the earliest
-- physical row per key, so the UNIQUE index can be created. Deletes 0
-- rows when there are no duplicates.
DELETE FROM public.notifications a
USING public.notifications b
WHERE a.user_id      = b.user_id
  AND a.workspace_id = b.workspace_id
  AND a.type         = b.type
  AND a.created_day  = b.created_day
  AND a.created_day IS NOT NULL
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
  ON public.notifications (user_id, workspace_id, type, created_day);

-- ── email_logs ──────────────────────────────────────────────────────
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS created_day date
  GENERATED ALWAYS AS (((created_at AT TIME ZONE INTERVAL '0'))::date) STORED;

DELETE FROM public.email_logs a
USING public.email_logs b
WHERE a.user_id        = b.user_id
  AND a.workspace_id   = b.workspace_id
  AND a.template_alias = b.template_alias
  AND a.created_day    = b.created_day
  AND a.created_day IS NOT NULL
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_dedup_idx
  ON public.email_logs (user_id, workspace_id, template_alias, created_day);

NOTIFY pgrst, 'reload schema';
