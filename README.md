# Shopped dashboard app template

The stock `static-dashboard-v1` scaffold for a repository-owned Shopped app.
It starts as one deployment with standalone, workspace card, and Home widget
surfaces plus a small Node API service.

After generating a repository from this template:

1. Change `app.json` identity, titles, and both `ownerSkill`/`dataSources.api.skill`
   to the owning Shopped skill.
2. Adapt the three pages and service to the requested outcome.
3. Add `database` and immutable SQL migrations only if the app persists data.
4. Run `npm test`, exercise all three pages locally with `?demo=1`, then publish
   the exact tested commit through Shopped.

The browser calls the platform-hosted `@shopped/app-runtime`; no credential is
stored in this repository.
