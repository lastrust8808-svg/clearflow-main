# Safe storage migration and recovery

1. Back up the current PostgreSQL database and any attached persistent disk before deployment.
2. Verify CLEARFLOW_STORAGE_DATABASE_URL (or CLEARFLOW_OWNER_DATABASE_URL) targets persistent PostgreSQL.
3. Export every legacy account folder from server/storage-data/accounts on the running host. Never delete originals.
4. For each app-data.json, compare the existing database snapshot. If absent, import as revision 1. If present, retain both copies for manual reconciliation.
5. For each files/*.json, remittance/*.json, plaid/connections.json, transaction-proof-chains/chains.json and extractions/*.json, import only when the corresponding database record is absent. Verify counts and hashes.
6. Perform a dry-run comparison of record counts, account IDs, file sizes and SHA-256 checksums before and after import. Preserve an immutable migration manifest.
7. Test saving, signing out, signing in, opening documents, and cross-device conflict rejection using test accounts.
8. Enable automated encrypted PostgreSQL backups with a retention policy; restore a backup into an isolated test database and verify records and attachments.
9. Deploy only after CI and restore verification pass. Roll back application code without deleting the database if a release fails.

Do not infer successful migration from a database connection alone. Existing filesystem records remain on the original host until explicitly migrated and verified.

## Release candidate verification (October 24, 2026)

The candidate remains a draft. Passing unit tests or a Vercel preview does not authorize production release.

Implementation changes:

- Commit `pg` and its transitive dependencies in the lockfile; CI installs with `npm ci`.
- Browser banking requests send the verified bearer and canonical account identifier. Provider token exchanges are not retried across guessed origins. Missing provider configuration returns an error rather than a demo bank connection.
- Every transaction read checks item ownership. Production vault operations require a private key; the server checks it before listening.
- Plaid Auth is optional during connection, with explicit unsupported-product errors distinguished from unexpected provider failures. Bank identity is not inferred from a self-entered name.
- Banking items have individual encrypted PostgreSQL records, provider item lookup, and optimistic revisions. Production reads bypass the runtime cache and legacy directory index.
- Browser vault access cannot return provider tokens or replace the server-owned connection vault.
- Workspace contents and their revision are read together, preventing a mismatched data/version response.

### Staging migration sequence

1. Preserve verified database and filesystem backups and the existing encryption key. A new key cannot decrypt existing vaults.
2. Against an isolated staging clone, apply `001_storage_foundation.sql`, then `002_plaid_items_and_legacy_records.sql`. The staging migration runner applies both in this order.
3. Migration 002 renames legacy `record_type` to `kind`, copies legacy app snapshots and canonical vault keys without deleting originals, and stops on conflicting snapshots/vaults. Do not resolve a conflict by overwriting data.
4. Run the existing filesystem migration in dry-run mode, then explicitly apply it only after reconciliation. Run the staging migration runner again afterward to backfill newly imported encrypted Plaid vaults into per-item records.
5. Backfill only accepts records whose embedded owner matches their vault owner. It never overwrites an existing per-item record and rejects conflicting ownership. Old browser user IDs still require verified mapping to current `local:` or `google:` account IDs; do not guess that mapping.
6. Run the database CI suites below before considering deployment. Actual production migration and deployment are separate actions.

### Database CI checks

The `storage-recovery` job provisions three disposable PostgreSQL databases. No production credentials are needed.

- `npm run test:legacy`: prior compatibility schema upgrade, repeat migration, historical record preservation, encrypted item backfill.
- `npm run test:storage`: HTTP storage isolation, revision conflicts, document retention, membership-based delivery, revoked membership, revoked/expired sessions, encrypted banking item retention in a fresh process.
- `npm run test:restore`: `pg_dump` into a temporary archive, restore into an empty dedicated database, compare every public table and decrypt restored banking records. Refuses to clean or overwrite a populated target.

Required URLs use database names `clearflow_staging`, `clearflow_legacy_test`, and `clearflow_restore_test`. Use isolated test infrastructure only. The restore test requires PostgreSQL client tools matching the server major version.

### Gates still requiring evidence

- A green run of the new PostgreSQL CI job on the exact combined candidate, then equivalent staging checks on the actual deployment configuration.
- Verified account-ID mapping and migration manifests for existing users and records.
- Browser reload/sign-in and multi-device verification against staging, including the optional owner workspace path.
- Plaid institution tests, OAuth redirect/callback implementation and registration verification, reconnect/update flows, signed webhooks and transaction delivery retries. Transaction sync currently clears pending delivery before browser acknowledgement; verify or change that contract before claiming lossless delivery.
- Authorized payment-provider submission, duplicate/retry handling, failure/return events and provider-confirmed reconciliation. Offline simulations do not establish those capabilities.

Local evidence: clean `npm ci`; unit/HTTP/browser service tests; type checking and build. Migration SQL and the legacy upgrade/backfill were additionally executed against PostgreSQL-WASM (PGlite). PGlite is not evidence of a successful multi-connection PostgreSQL run or `pg_dump`/restore.
