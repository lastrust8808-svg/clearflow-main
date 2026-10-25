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
- `npm run test:restore`: `pg_dump` into a custom-format archive, restore into an empty dedicated database, compare every public table and decrypt restored banking records. Refuses to clean or overwrite a populated target.

Required URLs use database names `clearflow_staging`, `clearflow_legacy_test`, and `clearflow_restore_test`. Use isolated test infrastructure only. The restore test requires PostgreSQL client tools matching the server major version.

### Gates still requiring evidence

- A green run of the new PostgreSQL CI job on the exact combined candidate, then equivalent staging checks on the actual deployment configuration.
- Verified account-ID mapping and migration manifests for existing users and records.
- Browser reload/sign-in and multi-device verification against staging, including the optional owner workspace path.
- Plaid institution tests, OAuth redirect/callback implementation and registration verification, reconnect/update flows, signed webhooks and transaction delivery retries. Transaction sync currently clears pending delivery before browser acknowledgement; verify or change that contract before claiming lossless delivery.
- Authorized payment-provider submission, duplicate/retry handling, failure/return events and provider-confirmed reconciliation. Offline simulations do not establish those capabilities.

Local evidence: clean `npm ci`; unit/HTTP/browser service tests; type checking and build. Migration SQL and the legacy upgrade/backfill were additionally executed against PostgreSQL-WASM (PGlite). PGlite is not evidence of a successful multi-connection PostgreSQL run or `pg_dump`/restore.

## Extended banking verification

`npm run test:banking-release` exercises actual application HTTP handlers with controlled provider responses, locally signed ES256 webhooks, and the bank-feed importer. It is a separate blocking CI job. These checks do not contact a bank, send funds, or verify a production OAuth registration.

Findings on candidate `5b8af641ed18425fa1fb287b52f558271d657cb9`:

| Risk | Direct result | Severity / confidence | Smallest remediation |
| --- | --- | --- | --- |
| Multi-account item attribution | Checking and savings transactions from one item are both imported into checking and attributed to checking's entity. The importer never checks provider `account_id` against `connectedProfile.externalAccountId`. | High / high | Partition additions and modifications by verified provider account ID before import. Apply each item's changes to all mapped accounts before acknowledging the batch; reject ambiguous mappings. |
| Failed browser persistence / delivery retry | The first sync response contains a transaction; without any acknowledgement or workspace save, a retry returns an empty additions list. The cursor advanced and pending records were cleared before the response. | High / high | Retain a durable, replayable delivery until an authenticated acknowledgement follows successful durable workspace persistence. Acknowledgements must identify the specific batch and preserve concurrent new changes. |
| Optional Auth consumer | The real reconnect callback throws `Cannot read properties of null (reading 'numbers')` when Auth is unavailable and the linked account has no mask. The masked control case succeeds. | Medium / high; blocks this supported connection case | Make `authResponse` nullable in the shared payload type, guard every consumer, and verify reconnects with and without account masks. |
| Duplicate input within an importer call | A duplicate transaction ID inside one additions array produces two feed entries. Separate-call replay is correctly deduplicated. | Medium / high, bounded reach | Extend the importer's seen-ID set as entries are imported. The current sync handler already deduplicates additions, so this is a missing importer safeguard rather than proof of duplicate posting through the current sync endpoint. |

Passing extended checks: foreign users are denied before provider operations on all five tested item endpoints; unexpected Auth errors do not create a successful connection; unsigned, altered, and expired webhooks cannot trigger sync; correctly signed webhooks can; a provider outage leaves the persisted cursor unchanged and the next retry recovers its transaction; replaying an already imported transaction in a separate importer call does not duplicate it.

The original 99 tests still pass on Node 22. The extended suite fails four leaf assertions (the framework also reports their failing parent group). Keep the draft blocked until these assertions pass through corrected behavior. No production implementation was changed in this verification pass.

## Banking delivery repair

The failed banking probes now have production fixes, rather than relaxed assertions:

- Linked-item changes are partitioned by `connectedProfile.externalAccountId`, applied to every mapped account, and retain one workspace receipt. Missing or ambiguous mappings stop the batch without acknowledging it.
- The importer deduplicates within a single response and across replays. It rejects non-finite amounts, prevents cross-entity/currency rule posting, and retains pending activity for review without auto-posting it.
- The shared connection payload models Auth as nullable, and the reconnect callback handles missing Auth and account masks.
- The server freezes a delivery with a unique ID and replays it until acknowledgement. Webhook changes arriving later remain queued separately. Optimistic item revisions prevent concurrent writes from silently replacing each other.
- The browser acknowledges only after its workspace write succeeds. The server independently reads the retained workspace and requires the matching receipt. Failed saves, failed acknowledgement responses, replay, and later batches cannot silently discard the delivery.
- Google autosave now waits for the durable server save before the Drive copy; it no longer starts a second delayed durable write that could overwrite newer data. A Drive failure remains visible as a save error.

Verification adds: browser save/ack ordering and retry checks; frozen delivery serialization; stale acknowledgement protection; full multi-account import; failed workspace save followed by rejected acknowledgement; later changes retained during acknowledgement; idempotent acknowledgement retries; and a fresh-process read of both retained accounting entries and the next unacknowledged delivery. The real PostgreSQL CI suite exercises the complete HTTP workflow and the existing backup/restore test compares all retained rows.

Completion scope: these checks establish application behavior under controlled provider responses. Deployment configuration, existing-user migration reconciliation, live institution/OAuth flows, and real payment execution still require separate direct evidence before the full app can be called ready for users.


## Deployment evidence and version coverage

The actual Render PostgreSQL services report version 18, so the storage/recovery CI matrix runs against PostgreSQL 16 and 18 using each service container's matching client tools. A pass on version 16 alone is not the full version-compatibility result.

Read-only Render inspection found the live `clearflow-api` service still serving main commit `e5eaa90562ed4b7ff0af5abaf25ce847e441a15d`; its production database currently exposes only the three owner workspace/audit/provider-event tables. The release branch has not been deployed there. The existing staging runner is `clearflow-staging-migration-test` and its database rejects external connections. The connector cannot run an existing cron job, so staging execution must use the authenticated Render dashboard/internal runner. Do not widen database network access to work around this.

CI completion and live-user readiness are separate entries: the repaired banking gate can pass while the running service still lacks the repaired code and schema. Existing-user reconciliation, authenticated browser flows against the configured runtime, institution/OAuth tests, and payment-provider evidence remain required before production use is claimed complete.


The first PostgreSQL 18 matrix attempt stopped before application tests because the runner's package sources did not contain `postgresql-client-18`. CI now executes `pg_dump`/`pg_restore` from the matching official database service container rather than relying on the host package repositories. This does not skip recovery testing or downgrade the server version. Matrix failures no longer cancel the other version's evidence.

## OAuth redirect implementation (local verification)

The server accepts an optional `PLAID_REDIRECT_URI` only from deployment configuration, never a request body. It rejects insecure remote URLs, credentials, query strings, fragments, and wildcard hosts before calling Plaid. Explicit sandbox localhost HTTP is allowed. Leave it unset until the corresponding deployed callback has been verified and its exact URL registered with Plaid.

The browser retains the original Link token in tab-scoped session storage for at most 30 minutes, bound to the verified account ID and selected reconnect target. On `oauth_state_id` return it opens accounting, resumes Link with that token and the received URI, and refuses missing, expired, or other-account sessions. It clears session state after successful exchange or explicit cancellation. Bearer and bank access tokens are not persisted by this mechanism. Same-tab browser storage is required; a new device/browser cannot recover this state.

Local checks: 104 general tests, 16 banking probes, TypeScript checking and production build. The OAuth state tests verify account mismatch, expiry, malformed state, original-token retention, reconnect target retention and cleanup. HTTP tests verify configured redirect propagation and unsafe/client-supplied redirect rejection. These tests do not establish actual browser redirects, institution authorization, registration, or bank-app handoff. Run those against the deployed staging callback, including reauthentication and reconnect to an existing account, before enabling redirect configuration or claiming this gate complete. No production deployment was performed.

The actual modal callback logic is additionally exercised with a React-hook harness and a controlled Link boundary: original-token resume without replacement, missing-session rejection, account-switch rejection, duplicate success suppression, and exit/success ordering. These probes exposed and now guard exchanges without a validated session and exchanges after an account switch. A synchronous processing guard prevents an exit or duplicate callback from racing React's next render. Updated local result: 108 general tests plus 16 banking probes pass. This harness is not evidence of a real browser or institution OAuth round trip.

Routing verification found that the initial OAuth implementation selected `ledger`, which renders `LedgerPage` rather than `AccountingPage` and therefore never mounts the Plaid modal. The return route now selects `accounting`. A regression executes the app's actual initialization effect and section renderer together; it failed with `LedgerPage` before the correction and passes with `AccountingPage` afterward. Normal ledger navigation and the unauthenticated return guard also pass. Final local count: 111 general tests plus 16 banking probes; type checking, server syntax, production build and diff checks pass. This is an app-routing logic test with page boundaries substituted, not a full browser or live provider round trip. All OAuth changes remain local and are not included in the earlier green remote CI candidate.

## Mercury workspace settlement guard

Further verification found that `applyMercuryProviderUpdateToOwnerWorkspace` used a separate mapper that treated Mercury `sent` as settled. Unlike the tested status response, that path could mark bills paid, discharge obligations and post ledger entries without reconciliation. Mercury documents that sent payments may still be processing (https://support.mercury.com/hc/en-us/articles/28768209374356-Tracking-missing-payments).

The workspace mapper now retains `sent` as clearing/processing with pending verification, without balance reductions or ledger posting. Before storage access, the updater rejects transactions without an ID or whose request ID differs from the requested payment, and mismatched approval-request IDs. Regression probes execute the actual updater and mapper with only the database boundary substituted. They failed before the fix and pass afterward, including reversed-payment handling. Local checks: 114 general tests, 16 banking probes, type checking, server syntax, production build and diff checks. These guards do not implement a complete reconciliation workflow or prove provider execution. The existing production service remains on its older code; release remains blocked on staging and provider verification.

## Payment polling failure precedence

A regression reproduced `classifyPaymentStatus` reporting bank confirmation when Mercury returned a completed record together with `reversed` or `blocked`. The polling route independently selected the first transaction, so provider array order also determined what reached the durable workspace updater. Both now share request-scoped selection: failures take precedence, conflicting unfinished evidence prevents confirmation, and foreign/identifierless records are excluded. The actual polling callback is tested with both orderings at provider and storage boundaries. Local verification: 117 general tests and 16 banking probes, type checking, production build, server syntax and diff checks pass. This conservative selection may retain processing where evidence conflicts; it does not establish final settlement or solve chronological ordering of separate webhook deliveries.
