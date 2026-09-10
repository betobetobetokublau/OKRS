-- =============================================================================
-- Boards (tableros) + sections + task placement, task priority/subtasks/
-- workspace_id, task comments with @mentions, per-task activity trail, and
-- DB-side notifications (task assigned / blocked / mentioned).
--
-- Design decisions (2026-09-10):
--   * Boards are a *lens* over tasks, orthogonal to KPI › Objective › Task.
--     A task lives in N boards, in exactly one section per board
--     (PK board_tasks(board_id, task_id)). Boards never roll up progress.
--   * tasks.objective_id becomes NULLABLE (backlog / personal-board items);
--     tasks.workspace_id is added so RLS no longer has to hop through
--     objectives. Progress modes (manual / auto / hybrid) are untouched.
--   * Sections ≠ status. Moving a card between sections never changes
--     tasks.status.
--   * Notifications are produced by triggers (SECURITY DEFINER context) so
--     the client never needs INSERT rights on other users' notifications.
-- Idempotent: every statement is guarded so the file can be re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. tasks: workspace_id, nullable objective_id, priority, parent_task_id
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.tasks add column if not exists priority text;
alter table public.tasks add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists sort_order integer not null default 0;

update public.tasks t
set workspace_id = o.workspace_id
from public.objectives o
where o.id = t.objective_id and t.workspace_id is null;

alter table public.tasks alter column workspace_id set not null;
alter table public.tasks alter column objective_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table public.tasks add constraint tasks_priority_check
      check (priority is null or priority in ('high', 'medium', 'low'));
  end if;
end $$;

create index if not exists tasks_workspace_id_idx on public.tasks(workspace_id);
create index if not exists tasks_parent_task_id_idx on public.tasks(parent_task_id);
create index if not exists tasks_assigned_user_id_idx on public.tasks(assigned_user_id);

-- Derive workspace_id from the objective when a client only sends objective_id
-- (keeps every existing insert path working), and keep them consistent.
create or replace function public.tasks_sync_workspace()
returns trigger language plpgsql as $$
declare v_ws uuid;
begin
  if new.objective_id is not null then
    select workspace_id into v_ws from public.objectives where id = new.objective_id;
    if v_ws is null then
      raise exception 'Objetivo % no existe', new.objective_id;
    end if;
    if new.workspace_id is null then
      new.workspace_id := v_ws;
    elsif new.workspace_id <> v_ws then
      raise exception 'La tarea y su objetivo pertenecen a workspaces distintos';
    end if;
  end if;
  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'Una tarea no puede ser su propia subtarea';
    end if;
    -- Subtasks inherit the workspace of the parent when not provided.
    if new.workspace_id is null then
      select workspace_id into new.workspace_id from public.tasks where id = new.parent_task_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tasks_sync_workspace on public.tasks;
create trigger tasks_sync_workspace
  before insert or update of objective_id, workspace_id, parent_task_id on public.tasks
  for each row execute function public.tasks_sync_workspace();

-- RLS: replace objective-hop policies with direct workspace membership.
drop policy if exists "Users access workspace tasks" on public.tasks;
drop policy if exists "Members can delete tasks in their workspaces" on public.tasks;
drop policy if exists "tasks_workspace_members" on public.tasks;
create policy "tasks_workspace_members" on public.tasks
  for all
  using (public.user_is_in_workspace(workspace_id))
  with check (public.user_is_in_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- 2. boards / board_members / board_sections / board_tasks
-- ---------------------------------------------------------------------------
create table if not exists public.boards (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  color         text not null default '#5c6ac4',
  icon          text,
  visibility    text not null default 'workspace' check (visibility in ('workspace', 'private')),
  owner_id      uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  is_favorite   boolean not null default false,
  sort_order    integer not null default 0,
  archived_at   timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists boards_workspace_id_idx on public.boards(workspace_id);

create table if not exists public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create table if not exists public.board_sections (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards(id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  wip_limit  integer,
  created_at timestamptz not null default now()
);
create index if not exists board_sections_board_id_idx on public.board_sections(board_id, position);

-- One row per (board, task): a task is in many boards but in ONE section per
-- board. section_id may be null ("Sin sección") after a section is deleted.
create table if not exists public.board_tasks (
  board_id   uuid not null references public.boards(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  section_id uuid references public.board_sections(id) on delete set null,
  position   integer not null default 0,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (board_id, task_id)
);
create index if not exists board_tasks_task_id_idx on public.board_tasks(task_id);
create index if not exists board_tasks_section_idx on public.board_tasks(board_id, section_id, position);

-- Guard: the section must belong to the same board.
create or replace function public.board_tasks_check_section()
returns trigger language plpgsql as $$
begin
  if new.section_id is not null and not exists (
    select 1 from public.board_sections s where s.id = new.section_id and s.board_id = new.board_id
  ) then
    raise exception 'La sección no pertenece a este tablero';
  end if;
  if new.added_by is null then new.added_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists board_tasks_check_section on public.board_tasks;
create trigger board_tasks_check_section
  before insert or update on public.board_tasks
  for each row execute function public.board_tasks_check_section();

-- Board + task must share a workspace.
create or replace function public.board_tasks_check_workspace()
returns trigger language plpgsql as $$
declare v_board_ws uuid; v_task_ws uuid;
begin
  select workspace_id into v_board_ws from public.boards where id = new.board_id;
  select workspace_id into v_task_ws  from public.tasks  where id = new.task_id;
  if v_board_ws is distinct from v_task_ws then
    raise exception 'La tarea y el tablero pertenecen a workspaces distintos';
  end if;
  return new;
end $$;
drop trigger if exists board_tasks_check_workspace on public.board_tasks;
create trigger board_tasks_check_workspace
  before insert or update of board_id, task_id on public.board_tasks
  for each row execute function public.board_tasks_check_workspace();

drop trigger if exists boards_set_created_by on public.boards;
create trigger boards_set_created_by before insert on public.boards
  for each row execute function public.set_created_by();
drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

-- Visibility helper: workspace boards are visible to every workspace member;
-- private boards only to owner + board_members. SECURITY DEFINER so policies
-- on board_sections / board_tasks / board_members can call it without
-- recursing into boards' own RLS.
create or replace function public.board_is_visible(_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boards b
    where b.id = _board_id
      and public.user_is_in_workspace(b.workspace_id)
      and (
        b.visibility = 'workspace'
        or b.owner_id = auth.uid()
        or exists (select 1 from public.board_members m where m.board_id = b.id and m.user_id = auth.uid())
      )
  );
$$;
revoke all on function public.board_is_visible(uuid) from public;
grant execute on function public.board_is_visible(uuid) to authenticated;

alter table public.boards         enable row level security;
alter table public.board_members  enable row level security;
alter table public.board_sections enable row level security;
alter table public.board_tasks    enable row level security;

drop policy if exists "boards_select" on public.boards;
create policy "boards_select" on public.boards for select
  using (public.board_is_visible(id));
drop policy if exists "boards_insert" on public.boards;
create policy "boards_insert" on public.boards for insert
  with check (public.user_is_in_workspace(workspace_id));
drop policy if exists "boards_update" on public.boards;
create policy "boards_update" on public.boards for update
  using (public.board_is_visible(id))
  with check (public.user_is_in_workspace(workspace_id));
drop policy if exists "boards_delete" on public.boards;
create policy "boards_delete" on public.boards for delete
  using (public.board_is_visible(id) and (visibility = 'workspace' or owner_id = auth.uid()));

drop policy if exists "board_members_all" on public.board_members;
create policy "board_members_all" on public.board_members for all
  using (public.board_is_visible(board_id))
  with check (public.board_is_visible(board_id));

drop policy if exists "board_sections_all" on public.board_sections;
create policy "board_sections_all" on public.board_sections for all
  using (public.board_is_visible(board_id))
  with check (public.board_is_visible(board_id));

drop policy if exists "board_tasks_all" on public.board_tasks;
create policy "board_tasks_all" on public.board_tasks for all
  using (public.board_is_visible(board_id))
  with check (public.board_is_visible(board_id));

-- ---------------------------------------------------------------------------
-- 3. comments: task_id + mentions
-- ---------------------------------------------------------------------------
alter table public.comments add column if not exists task_id uuid references public.tasks(id) on delete cascade;
alter table public.comments add column if not exists mentions uuid[] not null default '{}';
create index if not exists comments_task_id_idx on public.comments(task_id);

alter table public.comments drop constraint if exists comments_target_check;
alter table public.comments add constraint comments_target_check
  check (objective_id is not null or kpi_id is not null or task_id is not null);

drop policy if exists "Users access workspace comments" on public.comments;
drop policy if exists "Members can delete comments" on public.comments;
drop policy if exists "comments_workspace_members" on public.comments;
create policy "comments_workspace_members" on public.comments
  for all
  using (
    (objective_id is not null and exists (select 1 from public.objectives o where o.id = comments.objective_id and public.user_is_in_workspace(o.workspace_id)))
    or (kpi_id is not null and exists (select 1 from public.kpis k where k.id = comments.kpi_id and public.user_is_in_workspace(k.workspace_id)))
    or (task_id is not null and exists (select 1 from public.tasks t where t.id = comments.task_id and public.user_is_in_workspace(t.workspace_id)))
  )
  with check (
    user_id = auth.uid() and (
      (objective_id is not null and exists (select 1 from public.objectives o where o.id = comments.objective_id and public.user_is_in_workspace(o.workspace_id)))
      or (kpi_id is not null and exists (select 1 from public.kpis k where k.id = comments.kpi_id and public.user_is_in_workspace(k.workspace_id)))
      or (task_id is not null and exists (select 1 from public.tasks t where t.id = comments.task_id and public.user_is_in_workspace(t.workspace_id)))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. task_activity: per-task audit trail (fed by triggers)
-- ---------------------------------------------------------------------------
create table if not exists public.task_activity (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  kind         text not null check (kind in (
                 'created','status','priority','assignee','due_date','objective',
                 'title','board_added','board_removed','section','subtask_added')),
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists task_activity_task_idx on public.task_activity(task_id, created_at desc);
alter table public.task_activity enable row level security;
drop policy if exists "task_activity_select" on public.task_activity;
create policy "task_activity_select" on public.task_activity for select
  using (public.user_is_in_workspace(workspace_id));
-- No insert/update/delete policies on purpose: only triggers write here.

create or replace function public.tasks_log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'created', jsonb_build_object('title', new.title));
    if new.parent_task_id is not null then
      insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
        values (new.parent_task_id, new.workspace_id, v_actor, 'subtask_added',
                jsonb_build_object('subtask_id', new.id, 'title', new.title));
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'status',
              jsonb_build_object('from', old.status, 'to', new.status, 'block_reason', new.block_reason));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.assigned_user_id is distinct from old.assigned_user_id then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'assignee', jsonb_build_object('from', old.assigned_user_id, 'to', new.assigned_user_id));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.objective_id is distinct from old.objective_id then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'objective', jsonb_build_object('from', old.objective_id, 'to', new.objective_id));
  end if;
  if new.title is distinct from old.title then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, v_actor, 'title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  return new;
end $$;
drop trigger if exists tasks_log_activity on public.tasks;
create trigger tasks_log_activity
  after insert or update on public.tasks
  for each row execute function public.tasks_log_activity();

create or replace function public.board_tasks_log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_board text; v_sec text; v_from_sec text;
begin
  select b.workspace_id, b.name into v_ws, v_board from public.boards b where b.id = coalesce(new.board_id, old.board_id);
  if tg_op = 'INSERT' then
    select name into v_sec from public.board_sections where id = new.section_id;
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.task_id, v_ws, auth.uid(), 'board_added',
              jsonb_build_object('board_id', new.board_id, 'board', v_board, 'section', v_sec));
  elsif tg_op = 'DELETE' then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (old.task_id, v_ws, auth.uid(), 'board_removed', jsonb_build_object('board_id', old.board_id, 'board', v_board));
    return old;
  elsif new.section_id is distinct from old.section_id then
    select name into v_sec from public.board_sections where id = new.section_id;
    select name into v_from_sec from public.board_sections where id = old.section_id;
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.task_id, v_ws, auth.uid(), 'section',
              jsonb_build_object('board_id', new.board_id, 'board', v_board, 'from', v_from_sec, 'to', v_sec));
  end if;
  return new;
end $$;
drop trigger if exists board_tasks_log_activity on public.board_tasks;
create trigger board_tasks_log_activity
  after insert or update or delete on public.board_tasks
  for each row execute function public.board_tasks_log_activity();

-- ---------------------------------------------------------------------------
-- 5. Notifications from triggers: task_assigned, task_blocked, comment_mention
-- ---------------------------------------------------------------------------
create or replace function public.notify_task_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_slug text; v_actor_name text; v_url text;
begin
  select slug into v_slug from public.workspaces where id = new.workspace_id;
  select full_name into v_actor_name from public.profiles where id = v_actor;
  v_url := '/' || coalesce(v_slug, '') || '/tareas/' || new.id;

  -- Assigned (insert with assignee, or assignee changed) → notify the new assignee.
  if new.assigned_user_id is not null
     and (tg_op = 'INSERT' or new.assigned_user_id is distinct from old.assigned_user_id)
     and new.assigned_user_id is distinct from v_actor then
    insert into public.notifications(user_id, workspace_id, type, title, message, action_url)
      values (new.assigned_user_id, new.workspace_id, 'task_assigned',
              'Te asignaron una tarea',
              coalesce(v_actor_name, 'Alguien') || ' te asignó "' || new.title || '"',
              v_url);
  end if;

  -- Blocked → notify assignee and creator (except the actor).
  if tg_op = 'UPDATE' and new.status = 'blocked' and old.status is distinct from 'blocked' then
    insert into public.notifications(user_id, workspace_id, type, title, message, action_url)
      select distinct u, new.workspace_id, 'task_blocked',
             'Tarea bloqueada',
             coalesce(v_actor_name, 'Alguien') || ' bloqueó "' || new.title || '"' ||
               case when new.block_reason is not null then ': ' || new.block_reason else '' end,
             v_url
      from unnest(array[new.assigned_user_id, new.created_by]) as u
      where u is not null and u is distinct from v_actor;
  end if;
  return new;
end $$;
drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify
  after insert or update of assigned_user_id, status on public.tasks
  for each row execute function public.notify_task_events();

create or replace function public.notify_comment_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_slug text; v_url text; v_title text; v_actor_name text;
begin
  if coalesce(array_length(new.mentions, 1), 0) = 0 then return new; end if;

  if new.task_id is not null then
    select t.workspace_id, t.title into v_ws, v_title from public.tasks t where t.id = new.task_id;
    select slug into v_slug from public.workspaces where id = v_ws;
    v_url := '/' || v_slug || '/tareas/' || new.task_id;
  elsif new.objective_id is not null then
    select o.workspace_id, o.title into v_ws, v_title from public.objectives o where o.id = new.objective_id;
    select slug into v_slug from public.workspaces where id = v_ws;
    v_url := '/' || v_slug || '/objetivos/' || new.objective_id;
  elsif new.kpi_id is not null then
    select k.workspace_id, k.title into v_ws, v_title from public.kpis k where k.id = new.kpi_id;
    select slug into v_slug from public.workspaces where id = v_ws;
    v_url := '/' || v_slug || '/kpis/' || new.kpi_id;
  else
    return new;
  end if;
  select full_name into v_actor_name from public.profiles where id = new.user_id;

  insert into public.notifications(user_id, workspace_id, type, title, message, action_url)
    select distinct m, v_ws, 'comment_mention',
           'Te mencionaron',
           coalesce(v_actor_name, 'Alguien') || ' te mencionó en "' || coalesce(v_title, '') || '"',
           v_url
    from unnest(new.mentions) as m
    where m is not null and m <> new.user_id
      and exists (select 1 from public.user_workspaces uw where uw.user_id = m and uw.workspace_id = v_ws);
  return new;
end $$;
drop trigger if exists comments_notify_mentions on public.comments;
create trigger comments_notify_mentions
  after insert on public.comments
  for each row execute function public.notify_comment_mentions();

-- Realtime: the publication had no tables, so the in-app bell never fired.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Seed default boards per workspace (Sprint, Backlog, Iniciativas) with
--    default sections. Only for workspaces that have no boards yet.
-- ---------------------------------------------------------------------------
do $$
declare w record; b uuid; nm text; i int;
begin
  for w in select id from public.workspaces loop
    if exists (select 1 from public.boards where workspace_id = w.id) then continue; end if;
    i := 0;
    foreach nm in array array['Sprint', 'Backlog', 'Iniciativas'] loop
      insert into public.boards(workspace_id, name, color, visibility, sort_order)
        values (w.id, nm,
                case nm when 'Sprint' then '#47c1bf' when 'Backlog' then '#919eab' else '#f49342' end,
                'workspace', i)
        returning id into b;
      insert into public.board_sections(board_id, name, position) values
        (b, 'Por hacer', 0), (b, 'En curso', 1), (b, 'Hecho', 2);
      i := i + 1;
    end loop;
  end loop;
end $$;
