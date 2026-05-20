# Kublau OKR platform — agent notes

## Post-change review

After every **substantial change** (new feature, refactor, schema
migration, API surface change — not trivial typo/copy edits), run:

> Review if there's any refactoring/cleaning to be made, also check
> if there should be any unit tests to be added or to be removed (if
> applies) as well as a general security best practices audit

Treat this as a self-check before declaring a task complete.

## Database schema

The authoritative schema reference is `sql/SCHEMA.md`. **Always check it
before writing SQL migrations, RLS policies, or Supabase queries.** The
original spec (`okr-platform-spec.md` section 3.2) is outdated — several
tables have columns the spec doesn't show, and some spec columns don't
exist in the real DB.

Key gotchas:
- `tasks` has NO `workspace_id` — join through `objectives` to reach it.
- `progress_logs` has NO `task_id`. Canonical columns are
  `previous_value` / `new_value` / `comment` (older `progress_value` /
  `note` no longer exist).
- `objective_kpis` exists in the DB but is unused; code uses `kpi_objectives`.
- All status/role/mode columns are TEXT with CHECK constraints, **not**
  PostgreSQL enums.
- `notifications.action_url` (renamed from `link` 2026-05-20).
- `email_logs.template_alias` (renamed from `template` 2026-05-20).
- `created_by` on objectives/kpis/tasks is auto-stamped by trigger
  (`set_created_by` → `auth.uid()`); service-role inserts leave it NULL.
- `updated_at` on workspaces/profiles/kpis/objectives/tasks is auto-
  touched by a BEFORE UPDATE trigger (`set_updated_at`).

## Testing

Framework: **vitest** (unit tests colocated as `*.test.ts`).

- `npm test` — run suite once
- `npm run test:watch` — watch mode
- `npm run test:ui` — vitest UI

Covered today: `src/lib/utils/progress.ts`, `src/lib/utils/permissions.ts`,
`src/lib/api/rate-limit.ts`, `src/lib/validators/*`. API routes, hooks, and
RLS policies are not yet covered.

RLS isolation test: `sql/tests/rls-workspace-isolation.test.sql`. Run with
`psql "$SUPABASE_DB_URL" -f sql/tests/rls-workspace-isolation.test.sql`
against a dev project. Seeds two workspaces/users and asserts no cross-
workspace reads or writes across workspaces/profiles/objectives/kpis/
user_workspaces. Fails loudly on any bleed.

CI runs `tsc --noEmit`, `npm run lint`, and `npm test` on every PR via
`.github/workflows/ci.yml`.

## gstack

Installed under `~/.claude/skills/`. Each skill registers its own slash
command; the command name matches the directory / manifest `name`.

Available gstack slash commands:

- `/gstack-autoplan`
- `/gstack-benchmark`
- `/gstack-browse`
- `/gstack-canary`
- `/gstack-careful`
- `/gstack-checkpoint`
- `/gstack-codex`
- `/gstack-connect-chrome`
- `/gstack-cso`
- `/gstack-design-consultation`
- `/gstack-design-html`
- `/gstack-design-review`
- `/gstack-design-shotgun`
- `/gstack-devex-review`
- `/gstack-document-release`
- `/gstack-freeze`
- `/gstack-guard`
- `/gstack-health`
- `/gstack-investigate`
- `/gstack-land-and-deploy`
- `/gstack-learn`
- `/gstack-office-hours`
- `/gstack-open-gstack-browser`
- `/gstack-pair-agent`
- `/gstack-plan-ceo-review`
- `/gstack-plan-design-review`
- `/gstack-plan-devex-review`
- `/gstack-plan-eng-review`
- `/gstack-qa`
- `/gstack-qa-only`
- `/gstack-retro`
- `/gstack-review`
- `/gstack-setup-browser-cookies`
- `/gstack-setup-deploy`
- `/gstack-ship`
- `/gstack-unfreeze`
- `/gstack-upgrade`

Note: new skills added to `~/.claude/skills/` only become available in a
**new** Claude Code session — the available-skills list is snapshotted
at session start and doesn't hot-reload.
