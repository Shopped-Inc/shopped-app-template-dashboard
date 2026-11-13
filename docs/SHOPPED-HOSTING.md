# Dashboard hosting facts

Generic rules are in `.shopped/agent-guide.md`; this file records starter paths
and owner decisions. Adapt these facts rather than copying the generic rules.

| Fact | Starter value / owner step |
| --- | --- |
| Effective app root / manifest | Repository root / `app.json` |
| Frontend | Static `web/index.html`; card/widget entries alongside it |
| Backend | `services/api/service.json`, `index.mjs`, `server.mjs`, `store.mjs` |
| Health | `/healthz`; verifies database connectivity without changing schema |
| Local unit/contract tests | `npm test` (provider/database behavior stubbed in unit tests) |
| Standalone contract check | `node .shopped/shopped-repo-guide.mjs contract --lint web` |
| Local visual fixtures | `?demo=1`; still verify nested mounts and no-base localhost |
| Identity | Existing platform SDK; add absent/expired identity fixtures before protected-route changes |
| Public host/prefix map | None; no `service.json` public ingress block |
| Auto-deploy | No manifest deploy block; defaults off; verify binding state with owner |
| Single migration authority | Owner must establish workspace-owned baseline before first publish; no second ledger |
| Onboarding SQL | `database/onboarding/001_create_dashboard_state.sql` is owner input, never executed by publication |
| Minimum migration | After applying baseline, set `database.minimumMigration` to its actual stable slug |
| Startup/restart policy | Service does not run DDL; owner tests compatibility with the still-running release |
| Env/secret declarations | No service env entries initially; platform injects DATABASE_URL. List any new secret names, never values |
| Disposable DB check | Owner supplies a disposable Postgres URL for manual service tests; never use live credentials |

## Pre-PR checklist

- Revision (flag in title), main's parent and backward compatibility:
- Restart/rollback policy and owner prerequisites:
- Resulting env count out of 64 and new secret names:
- Public-path/CSP changes and regression tests:
- Resources/storage changes and owner review:

Tests simulate the contract; the owner verifies real sign-in, public ingress,
mounted surfaces and exact-SHA activation after any authorized publication.
