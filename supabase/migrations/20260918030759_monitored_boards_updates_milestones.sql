-- Monitored projects: a board can be flagged as "monitored" so it shows up on
-- the redone /tableros overview with its own status, a timeline of updates
-- (free-text posts, optionally tagged with a status) and milestones (dated
-- events that can be marked done). Updates and milestones never touch tasks.
-- Idempotent.

-- ── boards: monitored flag + project status ─────────────────────────────────
alter table public.boards add column if not exists is_monitored boolean not null default false;
alter table public.boards add column if not exists status text not null default 'on_time';
alter table public.boards drop constraint if exists boards_status_check;
alter table public.boards add constraint boards_status_check check (status in (
  'on_time', 'paused', 'blocked', 'off_track', 'at_risk', 'completed', 'dropped'));

-- The two seeded boards the team follows today start out monitored.
update public.boards set is_monitored = true
  where archived_at is null and name in ('Sprint', 'Iniciativas') and is_monitored = false;

-- ── board_updates: timeline of project posts ────────────────────────────────
create table if not exists public.board_updates (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  content      text not null,
  -- Optional status the author attaches to the post; same vocabulary as boards.status.
  status       text check (status is null or status in (
                 'on_time', 'paused', 'blocked', 'off_track', 'at_risk', 'completed', 'dropped')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_board_updates_board on public.board_updates (board_id, created_at desc);

alter table public.board_updates enable row level security;
drop policy if exists "board_updates_select" on public.board_updates;
create policy "board_updates_select" on public.board_updates for select
  using (public.board_is_visible(board_id));
drop policy if exists "board_updates_insert" on public.board_updates;
create policy "board_updates_insert" on public.board_updates for insert
  with check (public.board_is_visible(board_id) and author_id = auth.uid());
drop policy if exists "board_updates_modify_own" on public.board_updates;
create policy "board_updates_modify_own" on public.board_updates for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "board_updates_delete_own" on public.board_updates;
create policy "board_updates_delete_own" on public.board_updates for delete
  using (author_id = auth.uid());

-- ── board_milestones: dated events, done / not done ─────────────────────────
create table if not exists public.board_milestones (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null,
  due_date     date not null,
  done         boolean not null default false,
  done_at      timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_board_milestones_board on public.board_milestones (board_id, due_date);

alter table public.board_milestones enable row level security;
drop policy if exists "board_milestones_all" on public.board_milestones;
create policy "board_milestones_all" on public.board_milestones for all
  using (public.board_is_visible(board_id))
  with check (public.board_is_visible(board_id));

-- Keep done_at honest: set when done flips to true, cleared when it flips back.
create or replace function public.board_milestones_touch_done()
returns trigger language plpgsql as $$
begin
  if new.done and not coalesce(old.done, false) then new.done_at := now();
  elsif not new.done then new.done_at := null;
  end if;
  return new;
end $$;
drop trigger if exists board_milestones_touch_done on public.board_milestones;
create trigger board_milestones_touch_done before insert or update of done on public.board_milestones
  for each row execute function public.board_milestones_touch_done();

-- Live updates for the timeline (same publication the comments use).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_updates') then
    alter publication supabase_realtime add table public.board_updates;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'board_milestones') then
    alter publication supabase_realtime add table public.board_milestones;
  end if;
end $$;
