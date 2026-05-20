# Supabase Database Schema — Source of Truth

> Last verified: 2026-05-20 against production after applying
> `2026-05-20-schema-reconciliation.sql`. Update this file whenever
> a migration changes the schema.

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
| `kpis.status` | text | on_track, at_risk, off_track, achieved |
| `notifications.type` | text | monthly_review_reminder, quarterly_session, task_assigned, task_blocked, objective_updated, general (default `'info'`) |

## Helper functions & triggers

- `user_is_in_workspace(_workspace_id uuid) → boolean` — SECURITY DEFINER; checks if `auth.uid()` belongs to the workspace. Used by most RLS policies.
- `user_shares_workspace(_profile_id uuid) → boolean` — SECURITY DEFINER; checks if `auth.uid()` shares any workspace with the given profile.
- `set_created_by()` — BEFORE INSERT trigger on `objectives`, `kpis`, `tasks`. Stamps `NEW.created_by := auth.uid()` when `NULL`. Service-role inserts (admin client) leave `created_by` NULL since `auth.uid()` is NULL in that context.
- `set_updated_at()` — BEFORE UPDATE trigger on `workspaces`, `profiles`, `kpis`, `objectives`, `tasks`. Stamps `NEW.updated_at := now()` on every row change.

---

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
| objective_id | uuid | NO | | → objectives(id) |
| title | text | NO | | |
| description | text | YES | | |
| status | text | YES | 'pending' | CHECK pending/in_progress/completed/blocked |
| block_reason | text | YES | | |
| assigned_user_id | uuid | YES | | → profiles(id) |
| due_date | date | YES | | |
| created_by | uuid | YES | | → auth.users(id); auto-set by trigger |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | NO | now() | auto-updated by trigger |

**No `workspace_id`** — reach workspace through `objective_id → objectives.workspace_id`.

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
| content | text | NO | | |
| created_at | timestamptz | YES | now() | |

Code expects at least one of `kpi_id` / `objective_id` to be set. **No CHECK constraint enforces this in production** — enforce at application layer.

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

- **`tasks` has no `workspace_id`** — always join through `objective_id → objectives.workspace_id`.
- **`progress_logs` has no `task_id`** — progress logs only track objective/KPI changes.
- **`objective_kpis` is dead** — use `kpi_objectives` exclusively.
- **No PostgreSQL enums** — all status/role/mode columns are TEXT with CHECK constraints.
- **Dual user_id FKs** on `user_workspaces`, `user_departments`, `comments`, `progress_logs` — each references both `auth.users(id)` and `profiles(id)`. Both should resolve to the same UUID.
- **Legacy columns** on `kpis` (`target_value`, `current_value`, `unit`) and `objectives` (`progress`) are unused by application code; ignore in new logic.
- **`comments` / `progress_logs` / `checkin_entries`** lack the "at least one target" CHECK constraint — enforce in code.
