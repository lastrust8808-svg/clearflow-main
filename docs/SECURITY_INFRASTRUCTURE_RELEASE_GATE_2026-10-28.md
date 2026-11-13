# Security & Infrastructure release gate (2026-10-28)

Status: **NOT APPROVED FOR RELEASE**. This branch is an isolated audit/checklist; it does not assert that any security control has passed.

## Required evidence before merge

- Authentication: exercise server-side session issuance, expiry, logout/revocation, email verification and OAuth callback/reload on real staging browsers. Assert anonymous and revoked sessions receive 401.
- Tenant isolation: create two authenticated tenants, test read/write/list/delete, forged tenant IDs, membership boundaries, document identifiers and bank imports. Assert no cross-tenant data or metadata exposure; include concurrent writes.
- Database: run migrations from a sanitized legacy snapshot and a clean database; prove idempotence, foreign-key constraints, existing-user mapping and transactional rollback. Capture migration SHA and schema version.
- Backup/restore: perform a **real staging** PostgreSQL backup and restore to an isolated database, reconcile row counts/checksums, encryption/decryption and tenant ownership; document RPO/RTO and retention. CI pg_dump/restore is not sufficient.
- Dependencies: reproduce npm ci from lockfile, run npm audit --omit=dev and full audit, review exceptions and verify GitHub secret scanning and code scanning. Never publish credentials or fixture secrets.
- Staging: require separate database, secrets, OAuth redirect origins, email delivery, health/readiness, TLS and nonproduction payment/provider credentials. Prove browser refresh, restart persistence and failure recovery; capture build SHA and test logs.

## Existing workstream coordination

PR #16 contains release hardening and CI claims; review its exact head and evidence before cherry-picking or modifying code. PR #14 covers CORS but does not replace authorization. PR #19 owns Plaid compatibility. PR #17 owns billing; PR #18 owns workspace UI; PR #21 owns document verification. Avoid shared-file changes until integration owners agree.

## Integration dependencies

Authentication ↔ membership identity mapping; storage ↔ banking encrypted vault; migrations ↔ legacy user and entity data; staging ↔ OAuth/email provider configuration; payment ↔ verified webhook settlement; document verification ↔ durable tenant-scoped IDs.

## Merge criteria

Attach exact commit SHA, CI run URL and job conclusions, migration/restore evidence, threat-model results, browser test evidence and named unresolved blockers to the PR. No production deploy, merge or real-customer migration authorized by this branch.
