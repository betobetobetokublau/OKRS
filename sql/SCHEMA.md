# Supabase Database Schema — Source of Truth

> Last verified: 2026-05-20 against live Supabase Table Editor.
> Update this file whenever a migration changes the schema.

## Enums

| Name | Values |
|------|--------|
| `workspace_role` | admin, manager, member |
| `period_status` | active, upcoming, archived |
| `progress_mode` | manual, auto, hybrid |
| `objective_status` | in_progress, paused, deprecated, upcoming |
| `task_status` | pending, in_progress, completed, blocked |
| `notification_type` | monthly_review_reminder, quarterly_session, task_assigned, task_blocked, objective_updated, general |

`kpi_status` is stored as TEXT, not an enum. Values used: on_track, at_risk, off_track, achieved.

## Helper functions

- `user_is_in_workspace(_workspace_id uuid) → boolean` — SECURITY DEFINER; checks if `auth.uid()` belongs to the workspace. Used by most RLS policies.
- `user_shares_workspace(_profile_id uuid) → boolean` — SECURITY DEFINER; checks if `auth.uid()` shares any workspace with the given profile.

---

## Tables

### workspaces

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | | |
| slug | text | NO | | UNIQUE |
| settings | jsonb | NO | '{}' | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

### profiles

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | | PK, → auth.users(id) CASCADE |
| email | text | NO | | UNIQUE |
| full_name | text | NO | | |
| avatar_url | text | YES | | |
| must_change_password | boolean | NO | true | |
| onboarded_at | timestamptz | YES | | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

### user_workspaces

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → profiles(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| role | workspace_role | NO | 'member' | |
| created_at | timestamptz | NO | now() | |

UNIQUE(user_id, workspace_id)

### departments

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| name | text | NO | | |
| color | text | YES | '#6366f1' | |
| created_at | timestamptz | NO | now() | |

### user_departments

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → profiles(id) CASCADE |
| department_id | uuid | NO | | → departments(id) CASCADE |

UNIQUE(user_id, department_id)

### periods

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| name | text | NO | | |
| start_date | date | NO | | |
| end_date | date | NO | | |
| status | period_status | NO | 'upcoming' | |
| created_at | timestamptz | NO | now() | |

### kpis

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| period_id | uuid | NO | | → periods(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| title | text | NO | | |
| description | text | YES | | |
| progress_mode | progress_mode | NO | 'hybrid' | |
| manual_progress | integer | NO | 0 | CHECK 0..100 |
| status | text | NO | 'on_track' | Values: on_track, at_risk, off_track, achieved |
| responsible_user_id | uuid | YES | | → profiles(id) SET NULL |
| responsible_department_id | uuid | YES | | → departments(id) SET NULL |
| sort_order | integer | NO | 0 | |
| created_by | uuid | YES | | → auth.users(id) SET NULL |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

### objectives

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| period_id | uuid | NO | | → periods(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| title | text | NO | | |
| description | text | YES | | |
| status | objective_status | NO | 'upcoming' | |
| progress_mode | progress_mode | NO | 'hybrid' | |
| manual_progress | integer | NO | 0 | CHECK 0..100 |
| responsible_user_id | uuid | YES | | → profiles(id) SET NULL |
| responsible_department_id | uuid | YES | | → departments(id) SET NULL |
| start_date | date | YES | | |
| end_date | date | YES | | |
| created_by | uuid | YES | | → auth.users(id) SET NULL |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

CHECK(start_date IS NULL OR end_date IS NULL OR end_date >= start_date)

### tasks

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| objective_id | uuid | NO | | → objectives(id) CASCADE |
| title | text | NO | | |
| description | text | YES | | |
| status | task_status | NO | 'pending' | |
| block_reason | text | YES | | |
| assigned_user_id | uuid | YES | | → profiles(id) SET NULL |
| due_date | date | YES | | |
| created_by | uuid | YES | | → auth.users(id) SET NULL |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

No `workspace_id` — reach workspace through `objective_id → objectives.workspace_id`.

### kpi_objectives

| Column | Type | Nullable | FK |
|--------|------|----------|-----|
| kpi_id | uuid | NO | → kpis(id) CASCADE |
| objective_id | uuid | NO | → objectives(id) CASCADE |

PK(kpi_id, objective_id). This is the junction table used by all application code.

### kpi_departments

| Column | Type | Nullable | FK |
|--------|------|----------|-----|
| kpi_id | uuid | NO | → kpis(id) CASCADE |
| department_id | uuid | NO | → departments(id) CASCADE |

PK(kpi_id, department_id)

### objective_departments

| Column | Type | Nullable | FK |
|--------|------|----------|-----|
| objective_id | uuid | NO | → objectives(id) CASCADE |
| department_id | uuid | NO | → departments(id) CASCADE |

PK(objective_id, department_id)

### objective_kpis

Exists in the database but is NOT used by any application code. All KPI-objective joins go through `kpi_objectives`. This table may be a leftover from an earlier naming convention.

### comments

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → profiles(id) CASCADE |
| kpi_id | uuid | YES | | → kpis(id) CASCADE |
| objective_id | uuid | YES | | → objectives(id) CASCADE |
| content | text | NO | | |
| created_at | timestamptz | NO | now() | |

CHECK(objective_id IS NOT NULL OR kpi_id IS NOT NULL) — at least one target.

### progress_logs

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → profiles(id) CASCADE |
| period_id | uuid | YES | | → periods(id) CASCADE |
| workspace_id | uuid | YES | | → workspaces(id) CASCADE |
| kpi_id | uuid | YES | | → kpis(id) CASCADE |
| objective_id | uuid | YES | | → objectives(id) CASCADE |
| progress_value | integer | YES | | CHECK 0..100 |
| previous_value | integer | YES | | |
| new_value | integer | YES | | |
| comment | text | YES | | |
| note | text | YES | | |
| created_at | timestamptz | NO | now() | |

CHECK(objective_id IS NOT NULL OR kpi_id IS NOT NULL) — at least one target.

No `task_id` column (confirmed by runtime error 2026-05-20).

### checkins

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → auth.users(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| period_id | uuid | YES | | → periods(id) SET NULL |
| summary | text | YES | | |
| created_at | timestamptz | NO | now() | |

### checkin_entries

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| checkin_id | uuid | NO | | → checkins(id) CASCADE |
| objective_id | uuid | YES | | → objectives(id) CASCADE |
| task_id | uuid | YES | | → tasks(id) CASCADE |
| previous_progress | integer | YES | | |
| new_progress | integer | YES | | |
| previous_status | text | YES | | |
| new_status | text | YES | | |
| note | text | YES | | |
| created_at | timestamptz | NO | now() | |

CHECK(objective_id IS NOT NULL OR task_id IS NOT NULL)

### notifications

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → profiles(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| type | notification_type | NO | | |
| title | text | NO | | |
| message | text | NO | | |
| read | boolean | NO | false | |
| action_url | text | YES | | |
| created_at | timestamptz | NO | now() | |

### email_logs

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | | → profiles(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| template_alias | text | NO | | |
| postmark_message_id | text | YES | | |
| status | text | NO | 'sent' | |
| created_at | timestamptz | NO | now() | |

### password_reset_audits

| Column | Type | Nullable | Default | FK |
|--------|------|----------|---------|-----|
| id | uuid | NO | gen_random_uuid() | PK |
| actor_user_id | uuid | NO | | → auth.users(id) SET NULL |
| target_user_id | uuid | NO | | → auth.users(id) CASCADE |
| workspace_id | uuid | NO | | → workspaces(id) CASCADE |
| must_change_password | boolean | YES | | |
| created_at | timestamptz | NO | now() | |
