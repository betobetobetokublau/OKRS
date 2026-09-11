-- Subtasks are full tasks (tasks.parent_task_id) and may nest. Guard against
-- cycles (A → B → A) at any depth, and against a task becoming its own
-- ancestor when it is re-parented or decoupled and re-attached.
-- Idempotent.

create or replace function public.tasks_check_parent_cycle()
returns trigger language plpgsql as $$
declare v_cur uuid := new.parent_task_id; v_depth int := 0;
begin
  if v_cur is null then return new; end if;
  if v_cur = new.id then
    raise exception 'Una tarea no puede ser su propia subtarea';
  end if;
  -- Walk up the ancestor chain of the proposed parent; if we meet ourselves,
  -- attaching would close a loop. Depth cap protects against corrupt data.
  while v_cur is not null and v_depth < 100 loop
    select parent_task_id into v_cur from public.tasks where id = v_cur;
    if v_cur = new.id then
      raise exception 'Movimiento inválido: la tarea padre es una subtarea de esta tarea';
    end if;
    v_depth := v_depth + 1;
  end loop;
  return new;
end $$;

drop trigger if exists tasks_check_parent_cycle on public.tasks;
create trigger tasks_check_parent_cycle
  before insert or update of parent_task_id on public.tasks
  for each row execute function public.tasks_check_parent_cycle();

-- Also log re-parenting in the per-task activity trail (kind reused: 'objective'
-- is wrong here, so extend the allowed kinds with 'parent').
alter table public.task_activity drop constraint if exists task_activity_kind_check;
alter table public.task_activity add constraint task_activity_kind_check check (kind in (
  'created','status','priority','assignee','due_date','objective',
  'title','board_added','board_removed','section','subtask_added','parent'));

create or replace function public.tasks_log_parent_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_task_id is distinct from old.parent_task_id then
    insert into public.task_activity(task_id, workspace_id, actor_id, kind, payload)
      values (new.id, new.workspace_id, auth.uid(), 'parent',
              jsonb_build_object('from', old.parent_task_id, 'to', new.parent_task_id));
  end if;
  return new;
end $$;
drop trigger if exists tasks_log_parent_change on public.tasks;
create trigger tasks_log_parent_change
  after update of parent_task_id on public.tasks
  for each row execute function public.tasks_log_parent_change();
