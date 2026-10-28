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
No banking-specific tests have been executed by this branch at creation. No live provider verification has been performed by this workstream.

## Integration dependencies
Security & Infrastructure: tenant auth, encryption, unique indexes, migration runner, backup/restore.
Plaid PR #19: Link products, token vault, transaction sync and webhook routes.
Membership PR #17: settled/reversed state semantics and audit IDs.
ERP: account mapping, balanced journal interface and reconciliation UI.
