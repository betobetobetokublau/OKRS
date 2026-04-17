# Kublau OKR platform — agent notes

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
