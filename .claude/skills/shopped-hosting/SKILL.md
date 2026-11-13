---
name: shopped-hosting
description: Develop a Git-backed Shopped app. Use for routing/assets, auth/public paths, CSP/cache, service env/secrets/storage/resources, jobs, schema work, releases and hosted-only regressions, even when localhost works.
---
Read the repo entry point, `.shopped/agent-guide.md` and customer hosting facts
in `docs/SHOPPED-HOSTING.md`. Add a failing local regression for the affected
contract. Exercise nested mounts and no-base localhost, including absent/expired
identity rejection. Synthetic identity belongs only in test fixtures.
Run the contract checker and application CI, including disposable database tests.
Complete the customer pre-PR checklist: revision and compatible parent, env count
and new secret names, public/CSP and resource/storage changes. Flag migrations
and restart/rollback hazards to the owner. Report the tested SHA and owner
prerequisites, not a deploy. Never perform owner operations without approval.
