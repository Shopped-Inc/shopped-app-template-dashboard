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
3. Add new, forward-only SQL files under `database/migrations/` for schema
   changes. Migration filenames and contents are immutable after publication;
   never edit or reuse an existing migration.
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
not create or mutate schema; publication applies the manifest's immutable SQL
migrations before the service is activated.
