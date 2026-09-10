-- Fix: creating a board returned 403. PostgREST runs INSERT … RETURNING and the
-- returned row must pass the SELECT policy. That policy called
-- board_is_visible(id), a STABLE function that re-queries `boards` — inside the
-- same statement it sees the pre-insert snapshot, so the brand-new row "does not
-- exist" and the insert is rejected as an RLS violation.
--
-- The SELECT / UPDATE / DELETE policies on boards now test the row's own columns
-- (no self-lookup). board_is_visible() stays for the child tables
-- (board_sections / board_tasks / board_members), where the board row already
-- exists when they are evaluated.

drop policy if exists "boards_select" on public.boards;
create policy "boards_select" on public.boards for select
  using (
    public.user_is_in_workspace(workspace_id)
    and (
      visibility = 'workspace'
      or owner_id = auth.uid()
      or exists (select 1 from public.board_members m where m.board_id = boards.id and m.user_id = auth.uid())
    )
  );

drop policy if exists "boards_update" on public.boards;
create policy "boards_update" on public.boards for update
  using (
    public.user_is_in_workspace(workspace_id)
    and (
      visibility = 'workspace'
      or owner_id = auth.uid()
      or exists (select 1 from public.board_members m where m.board_id = boards.id and m.user_id = auth.uid())
    )
  )
  with check (public.user_is_in_workspace(workspace_id));

drop policy if exists "boards_delete" on public.boards;
create policy "boards_delete" on public.boards for delete
  using (
    public.user_is_in_workspace(workspace_id)
    and (visibility = 'workspace' or owner_id = auth.uid())
  );
