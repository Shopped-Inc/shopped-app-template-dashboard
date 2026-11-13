<!-- SHOPPED-HOSTING:BEGIN version=3 -->
## Shopped hosting — read before app changes
Read `.shopped/agent-guide.md` and customer facts/test commands in
`docs/SHOPPED-HOSTING.md`; Claude Code also has the repo-local hosting skill.
- Keep browser paths below the injected base/mount, not the origin root.
- Use platform identity; don't invent hosted cookie sessions or email claims.
- Keep secret values out of Git; list env/secret names for the owner.
- Preserve manifest CSP, public-path boundaries and opt-in non-personal caching.
- Fence scheduled jobs for live-only execution; keep external effects idempotent.
- Test nested mounted and no-base modes; synthetic identity only in tests.
- Flag migrations in the PR title; one compatible revision chained to main's head.
  App-owned history never uses database_migration_*.
- PR → CI/review → authorized exact-SHA release. Check auto-deploy before merge:
  when enabled, merging can publish. Complete owner prerequisites first; never
  perform owner-only operations or a production-deploying merge without approval.
<!-- SHOPPED-HOSTING:END -->
