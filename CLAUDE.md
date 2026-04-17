# Kublau OKR platform — agent notes

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
