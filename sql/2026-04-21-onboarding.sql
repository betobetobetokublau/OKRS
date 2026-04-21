-- First-time onboarding carousel: track whether a user has already seen
-- the member/manager intro so we don't replay it on every login.
--
-- A single nullable timestamp column on `profiles` is enough — NULL means
-- "never seen it", a non-null timestamp means "already completed". The
-- actual update happens server-side via `/api/onboarding/completar` with
-- the service-role client, so no RLS policy changes are required.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
