# Developing a Git-backed Shopped app

Generic contract; customer paths, test commands and migration authority belong
in `docs/SHOPPED-HOSTING.md`. Limits below are generated from platform code.

## Source and runtime
- Keep executable source in the bound repo, not a second workspace copy.
  `app.json` version 1 owns frontends, surfaces, services and logical databases.
- Normalized manifest fields: `capabilities`, `compatibility`, `dataSources`, `database`, `deploy`, `frontend`, `icon`, `id`, `ownerSkill`, `services`, `surfaces`, `title`, `version`.
- Resolve frontend entries from the manifest directory; services from the binding
  root. Preserve the framework; don't rewrite it to evade host limits.
- Server frontends have `service.json` beside their entry; listen on injected
  PORT, keep health inert/fast, and authenticate before private handlers.
- Keep locked dependencies in the persisted repository environment, not a
  build-container home. Separate install from build when supported.

## Browser URLs and identity
- Resolve browser URLs below the injected base href, never the origin root.
  Root links, fetch('/api'), CSS url(/...), srcset, history and router basenames
  escape the mount. Use relative build output and runtime-base-aware helpers.
- Backend requests arrive mount-stripped. DOM rewriting cannot fix preloads.
  Use path-only self redirects, not absolute URLs built from upstream Host
  (which may be app-backend.internal). Test mount/slash redirects.
- Use SDK fetch/data APIs; native fetch lacks embed credentials. Never call
  the private service origin directly from browser code.
- The authenticated proxy strips cookies/Authorization and app Set-Cookie.
  Trust X-Shopped-Identity and X-Shopped-Identity-Sig only behind that proxy.
  Base64 JSON has userId, workspaceId, role and millisecond exp, not email;
  optional app-scope claims may also exist. Validate fields/expiry, scope data
  by workspace and fail closed without identity. Never infer client email.
- Prefer SDK session.signIn for standalone sign-in. Embedded shells are public
  and inert so the parent can bootstrap; private data/actions require identity.
  Do not start OAuth in an iframe or add a runtime identity bypass.
- Sandbox preview identity requires the supported workspace-member sign-in flow;
  anonymous/direct-loopback requests have no identity. Synthetic identity is
  for test transports only, never a public dev-server bypass.
- service.json public paths (at most 32 per list) are explicit prefixes:
  /mcp also covers /mcp/x, not /mcpx. Public calls have identity stripped and
  need app-owned auth. Never widen a prefix to repair UI URLs; test each hostname.

## Browser policy and cache
- The viewer owns CSP. frontend.csp supports only `fontSrc`/`styleSrc`:
  up to 8 exact HTTPS origins per list, no wildcards/paths/IPs/keywords.
  Vendor scripts; these fields cannot open external script/fetch connections.
  HTTPS images/audio/video are already allowed, including media redirects.
- Server responses default no-store. Eligible successful GET/HEAD assets on
  isolated origins can opt in with positive max-age, no identity/Set-Cookie
  headers and Vary absent or only Accept-Encoding. The viewer clamps to
  86400 seconds, private, must-revalidate; shared/CDN caching stays disabled.
  HTML/JSON/APIs remain no-store. Never cache personal data as an asset.
- Hash/version asset URLs when bytes change. Strip incidental cookies only from
  non-personal assets: cached bytes can outlive sign-out until expiry.

## Env, storage and jobs
- service.json env has at most 64 entries. Reserved injected names:
  `DATABASE_URL`, `DATABASE_URL_PSYCOPG`, `PORT`, `SHOPPED_*`. Count total and per-environment entries before adding any.
- Declare literal strings or secret names, never secret values. List new vars
  and secret names in the PR for the owner; new values require a republish.
  Missing required config blocks release; do not invent optional syntax.
- Disk is ephemeral unless supported persistentData is enabled. Put durable
  service files on /data, not scratch; overlapping releases share the volume.
  Keep files compatible and arrange backups: a volume is not a backup.
- Review resources/storage with the owner. alwaysOn prevents idle freezing for
  scheduled work and consumes continuous capacity; request-only apps may not need it.
- Scheduled jobs check SHOPPED_SERVICE_LIVE_FILE (/run/shopped/live) before jobs
  and between batches. Healthy candidates aren't live. Keep effects idempotent
  or use leases; marker checks do not cancel in-flight calls. Request-spawned
  work must honor the app's kill switch where provided.

## Migrations and releases
- Record the database's single migration authority in the customer runbook.
  If app-owned, never use database_migration_*: an independent tool ledger
  diverges from the app history. Do not switch an established authority casually.
- Current publication does not execute repository migrations. The owner applies
  them before publish. App-owned migrations work may change this contract;
  follow shipped behavior for this app, not proposed automation.
- Keep migrations compatible with the still-running release: apply precedes
  publish and releases overlap. Expand first with nullable columns/new tables;
  remove/rename only in a later contract release.
- Add one revision per schema PR, chained to main's current head; rebase if it
  moved. Never edit applied history. Flag the revision in the PR title, update
  head assertions and test indexes/constraints/grants with disposable Postgres.
- Runtime credentials read/write data, not schema. Do not add startup DDL or
  use an owner credential to bypass a failed upgrade.
- Check startup revision policy. Exact equality to bundled head prevents old
  releases restarting or pre-migration rollback booting after migration. Flag
  that hazard; prefer tested compatible-revision acceptance where supported.
- Close clean read transactions before slow provider calls (SELECT starts one
  too). Preserve atomic writes and test disposable Postgres, not only SQLite.
- Branch → tests → PR → current-head CI/review → authorized merge → authorized
  exact bound branch-head SHA publication. Merge is not deployment. Report
  merged/activated SHAs separately; don't enable auto-deploy as a repair.
- Before PR: state revision/compatibility/restart policy, env count/secret names,
  public/CSP and resources/storage changes (or explicitly none).

## Proof without platform access
- Use fixtures for nested mount/query/hash, masked Host, stripped backend paths,
  missing/expired synthetic identity rejection, no-base localhost, cache/public
  paths and disposable schema cases. Stub providers and disable schedulers.
- Local tests don't prove real sign-in/ingress/activation; the owner checks those
  after publication. Never perform owner-only operations without approval.
