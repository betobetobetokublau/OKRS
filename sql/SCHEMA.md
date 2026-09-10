# Supabase Database Schema — Source of Truth

> Last verified: 2026-05-20 against production after applying
> `2026-05-20-schema-reconciliation.sql`; amended 2026-09-10 for
> `supabase/migrations/20260910220000_boards_tasks_comments.sql`
> (boards, task priority/subtasks/workspace_id, task comments, activity
> trail, trigger-driven notifications). Update this file whenever a
> migration changes the schema.

## Status-value conventions

Production stores status-like fields as `text` with `CHECK` constraints,
**not** as PostgreSQL enums. The migrations never defined enum types.
TypeScript still uses string-literal union types for these — the
runtime behavior is identical.

| Column | Type | Allowed values |
|--------|------|----------------|
| `user_workspaces.role` | text | admin, manager, member |
| `periods.status` | text | active, upcoming, archived |
| `kpis.progress_mode` / `objectives.progress_mode` | text | manual, auto, hybrid |
| `objectives.status` | text | upcoming, in_progress, paused, deprecated |
| `tasks.status` | text | pending, in_progress, completed, blocked |
| `tasks.priority` | text | high, medium, low (or NULL = sin prioridad) |
| `boards.visibility` | text | workspace, private |
| `task_activity.kind` | text | created, status, priority, assignee, due_date, objective, title, board_added, board_removed, section, subtask_added |
| `kpis.status` | text | on_track, at_risk, off_track, achieved |
| `notifications.type` | text | monthly_review_reminder, quarterly_session, task_assigned, task_blocked, comment_mention, objective_updated, general (default `'info'`) |

## Helper functions & triggers

- `user_is_in_workspace(_workspace_id uuid) → boolean` — SECURITY DEFINER; checks if `auth.uid()` belongs to the workspace. Used by most RLS policies.
- `user_shares_workspace(_profile_id uuid) → boolean` — SECURITY DEFINER; checks if `auth.uid()` shares any workspace with the given profile.
- `set_created_by()` — BEFORE INSERT trigger on `objectives`, `kpis`, `tasks`. Stamps `NEW.created_by := auth.uid()` when `NULL`. Service-role inserts (admin client) leave `created_by` NULL since `auth.uid()` is NULL in that context.
- `set_updated_at()` — BEFORE UPDATE trigger on `workspaces`, `profiles`, `kpis`, `objectives`, `tasks`, `boards`. Stamps `NEW.updated_at := now()` on every row change.
- `tasks_sync_workspace()` — BEFORE INSERT / UPDATE OF objective_id, workspace_id, parent_task_id on `tasks`. Derives `workspace_id` from the objective (or the parent task) when omitted; raises if task and objective belong to different workspaces or a task is its own parent.
- `board_is_visible(_board_id uuid) → boolean` — SECURITY DEFINER; true when the caller is in the board's workspace AND (visibility = 'workspace' OR owner OR listed in `board_members`). Used by every RLS policy on `boards`, `board_members`, `board_sections`, `board_tasks`.
- `board_tasks_check_section()` / `board_tasks_check_workspace()` — BEFORE triggers on `board_tasks`: the section must belong to the same board; board and task must share a workspace; `added_by` defaults to `auth.uid()`.
- `tasks_log_activity()` — AFTER INSERT / UPDATE on `tasks` (SECURITY DEFINER). Writes `task_activity` rows for created / status / priority / assignee / due_date / objective / title changes and `subtask_added` on the parent.
- `board_tasks_log_activity()` — AFTER INSERT / UPDATE / DELETE on `board_tasks` (SECURITY DEFINER). Writes `board_added` / `board_removed` / `section` activity.
- `notify_task_events()` — AFTER INSERT / UPDATE OF assigned_user_id, status on `tasks` (SECURITY DEFINER). Inserts `notifications` of type `task_assigned` (to the new assignee) and `task_blocked` (to assignee + creator), never to the actor. `action_url` = `/{slug}/tareas/{task_id}`.
- `notify_comment_mentions()` — AFTER INSERT on `comments` (SECURITY DEFINER). For each id in `mentions` that is a workspace member (and not the author) inserts a `comment_mention` notification titled "Te mencionaron" linking to the task / objective / KPI.
- **Realtime:** `public.notifications` is in the `supabase_realtime` publication (added 2026-09-10 — before that the publication was empty and the in-app bell never fired).

---

- `save_checkin(p_workspace_id, p_period_id, p_summary, p_entries jsonb, p_task_ids uuid[]) → uuid` — SECURITY INVOKER RPC (2026-09-11). Single transaction for the check-in submit: inserts `checkins`, applies objective progress/status updates (rows locked FOR UPDATE, previous values read server-side), writes `checkin_entries`, `progress_logs` and the "Check-in …" timeline `comments`, and completes `p_task_ids`. RLS applies as the caller. The client (`check-in/page.tsx`) calls only this.
- Realtime publication `supabase_realtime` contains `notifications`, `comments`, `task_activity`.

## Tables

### workspaces

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | | |
| slug | text | NO | | UNIQUE |
| settings | jsonb | NO | `'{}'` | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

### profiles

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | | PK, → auth.users(id) |
| email | text | NO | | |
| full_name | text | NO | | |
| avatar_url | text | YES | | |
| must_change_password | boolean | YES | true | |
| onboarded_at | timestamptz | YES | | NULL = never completed carousel |
| preferences | jsonb | NO | `'{}'` | Per-user UI prefs, e.g. `{ board_column_order: { [boardId]: sectionId[] } }` (added 2026-09-11) |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

### user_workspaces

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) AND → profiles(id) (dual FK) |
| workspace_id | uuid | NO | | → workspaces(id) |
| role | text | NO | 'member' | CHECK admin/manager/member |
| created_at | timestamptz | YES | now() | |

### departments

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) |
| name | text | NO | | |
| color | text | YES | `'#5c6ac4'` | |
| created_at | timestamptz | YES | now() | |

### user_departments

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) AND → profiles(id) (dual FK) |
| department_id | uuid | NO | | → departments(id) |

### periods

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) |
| name | text | NO | | |
| start_date | date | NO | | |
| end_date | date | NO | | |
| status | text | YES | 'upcoming' | CHECK active/upcoming/archived |
| created_at | timestamptz | YES | now() | |

### kpis

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) |
| period_id | uuid | YES | | → periods(id) |
| title | text | NO | | |
| description | text | YES | | |
| target_value | numeric | YES | 100 | **legacy / unused by code** |
| current_value | numeric | YES | 0 | **legacy / unused by code** |
| unit | text | YES | `'%'` | **legacy / unused by code** |
| manual_progress | numeric | YES | 0 | |
| computed_progress | numeric | YES | | computed by joins at read time |
| progress_mode | text | YES | 'manual' | CHECK manual/auto/hybrid |
| sort_order | integer | NO | 0 | |
| status | text | NO | 'on_track' | CHECK on_track/at_risk/off_track/achieved |
| responsible_user_id | uuid | YES | | → profiles(id) |
| responsible_department_id | uuid | YES | | → departments(id) |
| created_by | uuid | YES | | → auth.users(id); auto-set by trigger |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

### objectives

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) |
| period_id | uuid | YES | | → periods(id) |
| title | text | NO | | |
| description | text | YES | | |
| status | text | YES | 'upcoming' | CHECK upcoming/in_progress/paused/deprecated |
| progress | numeric | YES | 0 | **legacy / unused by code** |
| progress_mode | text | YES | 'manual' | CHECK manual/auto/hybrid |
| manual_progress | numeric | YES | 0 | |
| computed_progress | numeric | YES | | |
| responsible_user_id | uuid | YES | | → profiles(id) |
| responsible_department_id | uuid | YES | | → departments(id) |
| start_date | date | YES | | |
| end_date | date | YES | | |
| created_by | uuid | YES | | → auth.users(id); auto-set by trigger |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

### tasks

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) ON DELETE CASCADE; **added 2026-09-10**; derived by `tasks_sync_workspace` when omitted — still send it explicitly |
| objective_id | uuid | YES | | → objectives(id); **NULLABLE since 2026-09-10** (boards / backlog tasks) |
| parent_task_id | uuid | YES | | → tasks(id) ON DELETE CASCADE; set on subtasks (checklist items) |
| title | text | NO | | |
| description | text | YES | | |
| status | text | YES | 'pending' | CHECK pending/in_progress/completed/blocked |
| priority | text | YES | | CHECK high/medium/low or NULL |
| block_reason | text | YES | | |
| assigned_user_id | uuid | YES | | → profiles(id) |
| due_date | date | YES | | |
| sort_order | integer | NO | 0 | |
| created_by | uuid | YES | | → auth.users(id); auto-set by trigger |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

Indexes: `tasks_workspace_id_idx`, `tasks_parent_task_id_idx`, `tasks_assigned_user_id_idx`.
RLS: single policy `tasks_workspace_members` (FOR ALL) on `user_is_in_workspace(workspace_id)` — no objective hop anymore.
Triggers: `tasks_sync_workspace` (BEFORE), `tasks_log_activity` (AFTER), `tasks_notify` (AFTER, → `notify_task_events`), plus `set_created_by` / `set_updated_at`.
Listing top-level tasks? Always add `parent_task_id is null` — subtasks share the table.

### boards

A board is a *lens* over tasks, orthogonal to KPI › Objective › Task. Boards never roll up progress.

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) ON DELETE CASCADE |
| name | text | NO | | |
| description | text | YES | | |
| color | text | NO | '#5c6ac4' | |
| icon | text | YES | | |
| visibility | text | NO | 'workspace' | CHECK workspace/private |
| owner_id | uuid | YES | | → profiles(id) ON DELETE SET NULL |
| department_id | uuid | YES | | → departments(id) ON DELETE SET NULL |
| is_favorite | boolean | NO | false | |
| sort_order | integer | NO | 0 | |
| archived_at | timestamptz | YES | | soft archive |
| created_by | uuid | YES | | → auth.users(id); auto-set by trigger |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

RLS: select via `board_is_visible(id)`; insert/update require `user_is_in_workspace(workspace_id)`; delete requires visibility AND (`visibility = 'workspace'` OR owner). Every workspace was seeded with three boards (Sprint / Backlog / Iniciativas) on 2026-09-10.

### board_members

Explicit allow-list for `visibility = 'private'` boards.

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| board_id | uuid | NO | | → boards(id) ON DELETE CASCADE; PK part |
| user_id | uuid | NO | | → profiles(id) ON DELETE CASCADE; PK part |
| created_at | timestamptz | NO | now() | |

RLS: `board_members_all` (FOR ALL) on `board_is_visible(board_id)`.

### board_sections

Columns of a board. Sections ≠ status: moving a card never changes `tasks.status`.

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| board_id | uuid | NO | | → boards(id) ON DELETE CASCADE |
| name | text | NO | | |
| position | integer | NO | 0 | |
| wip_limit | integer | YES | | |
| created_at | timestamptz | NO | now() | |

RLS: `board_sections_all` (FOR ALL) on `board_is_visible(board_id)`. Index `(board_id, position)`.

### board_tasks

One row per (board, task): a task lives in N boards, in exactly ONE section per board.

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| board_id | uuid | NO | | → boards(id) ON DELETE CASCADE; PK part |
| task_id | uuid | NO | | → tasks(id) ON DELETE CASCADE; PK part |
| section_id | uuid | YES | | → board_sections(id) ON DELETE SET NULL (NULL = "Sin sección") |
| position | integer | NO | 0 | |
| added_by | uuid | YES | | → auth.users(id); defaults to `auth.uid()` via trigger |
| created_at | timestamptz | NO | now() | |

RLS: `board_tasks_all` (FOR ALL) on `board_is_visible(board_id)`. Triggers: `board_tasks_check_section`, `board_tasks_check_workspace` (BEFORE), `board_tasks_log_activity` (AFTER). Indexes on `task_id` and `(board_id, section_id, position)`.

### task_activity

Per-task audit trail. **Only triggers write here** — there are no insert/update/delete policies on purpose.

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| task_id | uuid | NO | | → tasks(id) ON DELETE CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) ON DELETE CASCADE |
| actor_id | uuid | YES | | → profiles(id) ON DELETE SET NULL; `auth.uid()` at write time |
| kind | text | NO | | CHECK — see conventions table |
| payload | jsonb | NO | '{}' | e.g. `{from, to}`, `{board_id, board, section}`, `{subtask_id, title}` |
| created_at | timestamptz | NO | now() | |

RLS: `task_activity_select` on `user_is_in_workspace(workspace_id)`. Index `(task_id, created_at desc)`.

### kpi_objectives

| Column | Type | Nullable | FK / Notes |
|--------|------|----------|------------|
| id | uuid | NO | PK (single UUID, not composite) |
| kpi_id | uuid | NO | → kpis(id) |
| objective_id | uuid | NO | → objectives(id) |

This is the junction table used by all application code.

### kpi_departments

| Column | Type | Nullable | FK / Notes |
|--------|------|----------|------------|
| id | uuid | NO | PK |
| kpi_id | uuid | NO | → kpis(id) |
| department_id | uuid | NO | → departments(id) |

### objective_departments

| Column | Type | Nullable | FK / Notes |
|--------|------|----------|------------|
| id | uuid | NO | PK |
| objective_id | uuid | NO | → objectives(id) |
| department_id | uuid | NO | → departments(id) |

### objective_kpis

Exists in the database but **is NOT used by application code**. All KPI-objective joins go through `kpi_objectives`. Leftover from an earlier naming convention; safe to ignore.

### comments

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) AND → profiles(id) (dual FK) |
| kpi_id | uuid | YES | | → kpis(id) |
| objective_id | uuid | YES | | → objectives(id) |
| task_id | uuid | YES | | → tasks(id) ON DELETE CASCADE; **added 2026-09-10** |
| mentions | uuid[] | NO | '{}' | profile ids @mentioned in `content` (`@[Nombre](uuid)` tokens); **added 2026-09-10** |
| content | text | NO | | |
| created_at | timestamptz | YES | now() | |

CHECK `comments_target_check`: at least one of `objective_id` / `kpi_id` / `task_id` must be set (added 2026-09-10).
RLS: `comments_workspace_members` — visible when the caller is in the workspace of the referenced objective / KPI / task; inserts additionally require `user_id = auth.uid()`.
Trigger `comments_notify_mentions` (AFTER INSERT → `notify_comment_mentions`) turns `mentions` into `comment_mention` notifications.

### progress_logs

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) AND → profiles(id) (dual FK) |
| period_id | uuid | YES | | → periods(id) ON DELETE CASCADE |
| workspace_id | uuid | YES | | → workspaces(id) ON DELETE CASCADE |
| kpi_id | uuid | YES | | → kpis(id) |
| objective_id | uuid | YES | | → objectives(id) |
| previous_value | numeric | YES | | |
| new_value | numeric | YES | | |
| comment | text | YES | | |
| created_at | timestamptz | YES | now() | |

**Canonical column names: `previous_value` / `new_value` / `comment`.** Older naming (`progress_value` / `note`) no longer exists. **No `task_id` column.**

### checkins

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) |
| workspace_id | uuid | NO | | → workspaces(id) |
| period_id | uuid | YES | | → periods(id) |
| summary | text | YES | | |
| created_at | timestamptz | NO | now() | |

### checkin_entries

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| checkin_id | uuid | NO | | → checkins(id) |
| objective_id | uuid | YES | | → objectives(id) |
| task_id | uuid | YES | | → tasks(id) |
| previous_progress | integer | YES | | |
| new_progress | integer | YES | | |
| previous_status | text | YES | | |
| new_status | text | YES | | |
| note | text | YES | | |
| created_at | timestamptz | NO | now() | |

Code expects at least one of `objective_id` / `task_id` to be set. No CHECK constraint in production.

### notifications

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) |
| workspace_id | uuid | NO | | → workspaces(id) |
| type | text | YES | 'info' | values listed in conventions table above |
| title | text | NO | | |
| message | text | YES | | |
| read | boolean | YES | false | |
| action_url | text | YES | | **renamed from `link` on 2026-05-20** |
| created_at | timestamptz | YES | now() | |

### email_logs

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | YES | | → profiles(id) ON DELETE CASCADE (added 2026-05-20) |
| workspace_id | uuid | YES | | → workspaces(id) |
| to_email | text | YES | | NOT NULL relaxed on 2026-05-20; code populates Postmark directly |
| template_alias | text | NO | | **renamed from `template` on 2026-05-20** |
| postmark_message_id | text | YES | | added 2026-05-20 |
| status | text | YES | 'sent' | |
| error | text | YES | | present but not written by current code |
| created_at | timestamptz | YES | now() | |

### password_reset_audits

| Column | Type | Nullable | Default | FK / Notes |
|--------|------|----------|---------|------------|
| id | uuid | NO | gen_random_uuid() | PK |
| actor_user_id | uuid | NO | | → auth.users(id) |
| target_user_id | uuid | NO | | → auth.users(id) |
| workspace_id | uuid | NO | | → workspaces(id) |
| must_change_password | boolean | YES | | |
| created_at | timestamptz | NO | now() | |

---

## Gotchas

- **`tasks.workspace_id` exists (since 2026-09-10)** and `tasks.objective_id` is nullable — filter tasks by `workspace_id` directly and never assume a task has an objective. Subtasks share the table: add `parent_task_id is null` when listing top-level tasks.
- **`progress_logs` has no `task_id`** — progress logs only track objective/KPI changes.
- **`objective_kpis` is dead** — use `kpi_objectives` exclusively.
- **No PostgreSQL enums** — all status/role/mode columns are TEXT with CHECK constraints.
- **Dual user_id FKs** on `user_workspaces`, `user_departments`, `comments`, `progress_logs` — each references both `auth.users(id)` and `profiles(id)`. Both should resolve to the same UUID.
- **Legacy columns** on `kpis` (`target_value`, `current_value`, `unit`) and `objectives` (`progress`) are unused by application code; ignore in new logic.
- **`progress_logs` / `checkin_entries`** lack the "at least one target" CHECK constraint — enforce in code. (`comments` got `comments_target_check` on 2026-09-10.)
- **`task_activity` is trigger-only** — clients can read it but never insert; do not build write paths against it.
- **Notifications are produced by DB triggers** (`task_assigned`, `task_blocked`, `comment_mention`) — the client never inserts notifications for other users.
