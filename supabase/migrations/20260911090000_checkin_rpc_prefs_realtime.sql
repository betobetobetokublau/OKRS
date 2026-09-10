-- =============================================================================
-- 1. save_checkin(): one transactional RPC for the check-in submit (replaces
--    the 6 sequential client writes; audit finding P0). SECURITY INVOKER so
--    every write still goes through RLS as the calling user.
-- 2. profiles.preferences jsonb — per-user UI preferences (e.g. board column
--    order). Only the owner can read/write it (existing profiles policies).
-- 3. Realtime: comments + task_activity so task panels update live.
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. save_checkin
-- ---------------------------------------------------------------------------
-- p_entries: [{ "objective_id": uuid, "new_progress": int|null,
--               "new_status": text|null, "comment": text|null }]
-- p_task_ids: tasks to mark completed.
create or replace function public.save_checkin(
  p_workspace_id uuid,
  p_period_id    uuid,
  p_summary      text,
  p_entries      jsonb default '[]'::jsonb,
  p_task_ids     uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_checkin  uuid;
  e          jsonb;
  v_obj_id   uuid;
  v_new_prog integer;
  v_new_stat text;
  v_comment  text;
  v_obj      record;
  v_task     record;
  v_parts    text;
  v_label    text;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if not public.user_is_in_workspace(p_workspace_id) then
    raise exception 'No perteneces a este workspace' using errcode = '42501';
  end if;

  insert into public.checkins(user_id, workspace_id, period_id, summary)
    values (v_user, p_workspace_id, p_period_id, nullif(btrim(coalesce(p_summary, '')), ''))
    returning id into v_checkin;

  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    v_obj_id   := (e->>'objective_id')::uuid;
    v_new_prog := nullif(e->>'new_progress', '')::integer;
    v_new_stat := nullif(e->>'new_status', '');
    v_comment  := nullif(btrim(coalesce(e->>'comment', '')), '');

    select id, manual_progress, status into v_obj
      from public.objectives
      where id = v_obj_id and workspace_id = p_workspace_id
      for update;
    if not found then
      raise exception 'Objetivo % no encontrado en el workspace', v_obj_id;
    end if;

    if v_new_prog is not null and (v_new_prog < 0 or v_new_prog > 100) then
      raise exception 'Progreso fuera de rango (0-100)';
    end if;
    if v_new_stat is not null and v_new_stat not in ('in_progress','paused','deprecated','upcoming') then
      raise exception 'Estado de objetivo inválido: %', v_new_stat;
    end if;

    if v_new_prog is not null or v_new_stat is not null then
      update public.objectives
        set manual_progress = coalesce(v_new_prog, manual_progress),
            status          = coalesce(v_new_stat, status)
        where id = v_obj_id;
    end if;

    insert into public.checkin_entries(checkin_id, objective_id, previous_progress, new_progress, previous_status, new_status, note)
      values (v_checkin, v_obj_id, v_obj.manual_progress, v_new_prog, v_obj.status, v_new_stat, v_comment);

    if v_new_prog is not null and v_new_prog <> v_obj.manual_progress then
      insert into public.progress_logs(user_id, workspace_id, period_id, objective_id, previous_value, new_value, comment)
        values (v_user, p_workspace_id, p_period_id, v_obj_id, v_obj.manual_progress, v_new_prog, v_comment);
    end if;

    -- Timeline comment mirroring the old client behaviour:
    -- "Check-in cambió estado a "X" — nota"
    v_parts := null;
    if v_new_stat is not null and v_new_stat <> v_obj.status then
      v_label := case v_new_stat
        when 'in_progress' then 'En progreso' when 'paused' then 'En pausa'
        when 'deprecated' then 'Deprecado' when 'upcoming' then 'Próximo' else v_new_stat end;
      v_parts := 'cambió estado a "' || v_label || '"';
    end if;
    if v_comment is not null then
      v_parts := coalesce(v_parts || ' ', '') || '— ' || v_comment;
    end if;
    if v_parts is not null then
      insert into public.comments(user_id, objective_id, content)
        values (v_user, v_obj_id, 'Check-in ' || v_parts);
    end if;
  end loop;

  for v_task in
    select t.id, t.status from public.tasks t
      where t.id = any(coalesce(p_task_ids, '{}'::uuid[])) and t.workspace_id = p_workspace_id
      for update
  loop
    if v_task.status = 'completed' then continue; end if;
    update public.tasks set status = 'completed', block_reason = null where id = v_task.id;
    insert into public.checkin_entries(checkin_id, task_id, previous_status, new_status)
      values (v_checkin, v_task.id, v_task.status, 'completed');
  end loop;

  return v_checkin;
end $$;

revoke all on function public.save_checkin(uuid, uuid, text, jsonb, uuid[]) from public;
grant execute on function public.save_checkin(uuid, uuid, text, jsonb, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. profiles.preferences
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Realtime for comments + task_activity
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'task_activity') then
    alter publication supabase_realtime add table public.task_activity;
  end if;
end $$;
