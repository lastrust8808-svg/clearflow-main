# Banking & Reconciliation workstream — 2026-10-28

Status: implementation and provider verification pending. This document is a test contract, **not** evidence of passing tests.

## Scope and boundaries
Own Mercury and Plaid read-only feed adapters, normalization, deduplication, transaction matching, inter-account transfer pairing, statement reconciliation, and exception reporting.
Never issue payment, ACH debit, wire, or transfer requests from this workstream. No production deployment or merge.
Coordinate with PR #16 for authenticated tenant-scoped durable storage and migrations; PR #19 for Plaid compatibility; PR #17 for settlement state. Avoid changing their files without review.

## Canonical transaction requirements
- Identity key: (tenant_id, provider, connection_id, account_id, provider_transaction_id), unique in durable storage. Replayed imports are idempotent.
- Preserve provider IDs, original raw payload hash, effective/posting dates, signed amount, currency, status, account owner, import cursor, and provenance.
- Pending-to-posted transitions may replace pending entries only via provider-provided linkage or explicit audited match; never count both as final ledger activity.
- Modified and removed Plaid sync events must be applied atomically with the cursor; failed pages must not advance cursor.
- Reimporting CSV plus provider feed requires a reviewable possible-duplicate queue, not silent fuzzy deletion.
- All account queries, updates, matching and reconciliation operations must be tenant-authorized on the server.

## Transfer matching
- Candidate pair: opposite-signed same-currency amounts, distinct accounts, compatible posting windows, supporting provider/reference identifiers.
- Confidence scoring is advisory. Ambiguous matches remain unpaired; no silent ledger mutation.
- A confirmed transfer posts paired internal movement, not revenue or expense, and can be reversed with audit history.

## Reconciliation acceptance gates
1. Fixture replay 3x: exactly one canonical posted record per provider transaction.
2. Pending-to-posted, modified, removed, pagination interruption and cursor retry: no missing/double counted records.
3. Concurrent imports and same transaction from different feeds: deterministic conflict handling.
4. Same-value distinct transactions: no false deduplication.
5. Cross-tenant import, query, match, transfer and reconciliation attempts denied.
6. Opening + inflows - outflows = statement ending balance, by account/currency and closed date window.
7. Missing entry, duplicate, wrong date, transfer imbalance and late arrival surfaced as exceptions.
8. Restart, migration and restore preserve IDs, cursors, matches, locks and audit trail.
9. Sandbox Plaid webhook and OAuth mobile reconnect tested with redacted evidence.
10. Mercury read-only API smoke test against an explicitly authorized account, with no payment actions.
11. CI commands, job URLs, commit SHAs and redacted artifacts recorded before any gate is marked passed.

## Current evidence
The banking-specific CI suite now exercises the pure replay planner, atomic commit contract, reconciliation close guards and a PostgreSQL adapter against a deterministic injected SQL-client fixture. This is **not** a live PostgreSQL transaction/restore test and is **not** Mercury/Plaid provider verification. Read the latest PR CI run and commit SHA for current test counts.

The proposed versioned migration `server/db/versions/003_banking_feed_checkpoints.sql` is intentionally **not wired into** the staging migration runner. The new `server/services/bankFeedPostgresStore.js` accepts an injected pool, scopes all reads/writes by tenant, provider and connection, filters entry reads by authorized accounts, locks the cursor row with `FOR UPDATE`, and acknowledges a page only after `COMMIT`. Its fixture tests exercise successful commit, stale cursor, write/CAS/COMMIT rollback, foreign tenant, foreign account and unsafe BIGINT revision. A trusted server route must still establish actual authenticated account permissions, explicitly provision authorized checkpoints, apply and restore-test the schema in staging, and connect normalized provider responses to this adapter before durable ingestion is considered verified.


## Raw provider payload fingerprint contract (non-posting planner)

The optional `providerPayloadHash` field is a lowercase, 64-character SHA-256 digest of the exact raw provider transaction payload, calculated by a **trusted server-side provider adapter** before normalization. This branch validates digest shape and replay consistency; it does **not** fetch provider data, compute a digest, authenticate the adapter, or persist audit evidence.

- New transactions may carry the digest; legacy un-hashed rows remain accepted but are **not verified for raw-payload integrity**.
- Replayed `added` events must match the stored digest and normalized values. A different digest requires audited exception handling, not silent deduplication.
- A `modified` event with a new digest triggers a reviewable change even when tracked normalized fields are identical. A previously hashed row cannot be downgraded by omitting its digest.
- The same digest with different normalized amount, status or pending link is rejected as inconsistent adapter evidence.
- Removal tombstones carry only provider identity; the prior digest remains on the stored row.
- Before release, the authenticated ingestion service must compute and verify raw provider hashes, persist them and cursor/entries atomically, and retain a redacted provider audit trail. CI fixture hashes are not proof of live provider behavior.

## Integration dependencies
Security & Infrastructure: tenant auth, encryption, unique indexes, migration runner, backup/restore.
Plaid PR #19: Link products, token vault, transaction sync and webhook routes.
Membership PR #17: settled/reversed state semantics and audit IDs.
ERP: account mapping, balanced journal interface and reconciliation UI.

## Review-only internal transfer candidate gate (2026-11-02)

The isolated `server/services/bankTransferCandidates.js` module proposes, but never posts or confirms, an internal transfer only when two **posted** transactions have opposite exact-cent amounts, distinct bank accounts, the same currency, an identical nonempty provider reference, and posting dates within three calendar days. A source with multiple possible counterparts is reported as ambiguous and no candidate is proposed for it. Missing references and amount/date-only coincidences are not enough to infer a transfer. All input rows must belong to the explicit tenant scope and have unique account/transaction IDs. No bank-provider requests, database writes, ledger mutations, or payment actions occur.

The candidate output has `status: 'review_required'` and is not a controller approval or a reconciled transfer. Integration requires Security's authenticated account scope, ERP's durable reviewed pairing/audit workflow, and a verified provider reference mapping. The isolated regression tests are in `tests/bankTransferCandidates.test.mjs`; CI run evidence must be inspected separately before claiming a pass.
