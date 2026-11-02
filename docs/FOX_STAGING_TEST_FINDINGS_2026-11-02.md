# Fox persistence test-mode environment findings — 2026-11-02

## Confirmed Render inventory
- Workspace: My Workspace (`tea-d718p3gule4c738jvnmg`).
- Live API: `clearflow-api` (`srv-d7190au3jp1c7394jui0`), tracks `main`, current live SHA `e5eaa90562ed4b7ff0af5abaf25ce847e441a15d`.
- Production owner DB: `clearflow-owner-data` (`dpg-db3it40m7kps73eslad0-a`), currently has only `clearflow_owner_audit_log`, `clearflow_owner_provider_events`, `clearflow_owner_workspaces` in public schema.
- Isolated staging DB: `clearflow-staging` (`dpg-dbb1m1c9v7es73acahj0-a`), status available; external IP allowlist empty, so hosted read-only SQL connector cannot inspect it.
- Existing staging migration cron: `clearflow-staging-migration-test` (`crn-dbb1s0u7bikc73be5cq0`), tracks `work/release-gates-2026-10-23`, not this integration branch.

## Repro and evidence required
- Establish disposable staging runner connected through Render internal networking to isolated staging database. Do not open database publicly to unblock inspection.
- Verify schema and migration version from runner before any test data changes.
- Register synthetic Fox-like user through actual Google/OAuth flow or controlled test auth, create entity, save, reload, sign out, restart, sign back in, and compare database-backed IDs and revisions.
- Assert no local filesystem fallback is used in staging and no false success is shown on database failures.
- Confirm two independent identities can share the same authorized Clear.Flow entity but company identity cannot access owner's other entities.
- Collect CI/build SHA, HTTP responses, durable row evidence and browser/mobile screenshots.
- Preserve existing Fox records; no migration, overwrite or deletion of real user data.
- Live API and owner database are not a test target. No deployment or real payment authorized.

## Current outcome
**Not yet reproduced or resolved.** The isolated database exists, but no staging API for this branch or accessible runner has been verified. Existing unit/integration source tests are not live browser evidence.
