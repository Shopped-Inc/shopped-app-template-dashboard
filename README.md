# Shopped dashboard app template

The stock `static-dashboard-v1` scaffold for a repository-owned Shopped app.
It starts as one deployment with standalone, workspace card, and Home widget
surfaces plus a small Node API service and a managed Postgres database. All
three surfaces read the same persisted dashboard state. Pressing **Refresh**
records a write, so the stock app exercises the complete browser → Shopped
runtime → exact-SHA service → managed database path.

After generating a repository from this template:

1. Change `app.json` identity, titles, and both `ownerSkill`/`dataSources.api.skill`
   to the owning Shopped skill.
2. Adapt the three pages and service to the requested outcome.
3. Have the owner establish the database's single migration authority and apply
   its reviewed baseline before publication. `database/onboarding/` is one-time
   input, not an executed migration directory. For a workspace-owned database,
   create/apply the baseline through that database system, then set
   `database.minimumMigration` to the applied migration's stable slug.
   Never add a second ledger to a database with app-owned migration history.
4. Run `npm test`, exercise all three pages locally with `?demo=1`, then publish
   the exact tested commit through Shopped.

Each page ships meaningful semantic HTML for static-first paint, then
progressively enhances with the real platform `Page`, `Card`, `MetricCard`,
`Button`, and `DataTable` primitives from `@shopped/app-runtime`. It follows
the Shopped shell theme in embedded surfaces and the operating-system theme
when opened standalone. No credential is stored in this repository: Shopped
injects `DATABASE_URL` only when the service starts.

## Service development

The published service build is deterministic: `service.json` runs
`npm ci --omit=dev --ignore-scripts` against the committed service lockfile.
For local service work, use a disposable Postgres database:

```bash
npm --prefix services/api ci --ignore-scripts
DATABASE_URL=postgresql://... npm --prefix services/api start
```

`GET /api/summary` reads persisted state. `POST /api/summary/refresh` increments
the persisted refresh counter and returns the updated state. The service does
not create or mutate schema, and publication does **not** execute repository SQL.
The owner applies the reviewed baseline/migrations before publishing; keep schema
changes compatible with the still-running release.

## Repo-local guidance pilot

New template copies include managed top-eight rules in AGENTS.md and CLAUDE.md,
`.shopped/agent-guide.md`, version/digest metadata, a local hosting skill and a
customer-facts runbook. Imported customer repositories are never re-scaffolded:
use the bundled updater's preview and resolve conflicts rather than overwriting
instructions or symlinks.

The optional contract workflow stays **off by default** until the owner sets
`SHOPPED_CONTRACT_CHECKS=true`. It hard-fails certain manifest/env errors and
prints early env counts; URL checks remain warning-only. The bundled offline CLI
needs Node 24, no Shopped account:

```sh
node .shopped/shopped-repo-guide.mjs check
node .shopped/shopped-repo-guide.mjs update
# Only after reviewing the preview:
node .shopped/shopped-repo-guide.mjs update --write
node .shopped/shopped-repo-guide.mjs contract --lint web
```

No guide update pushes, opens a PR, enables auto-deploy or publishes anything.
Current platform main has removed its template-generation API; these passive
files support explicit GitHub template copies without restoring that API.
