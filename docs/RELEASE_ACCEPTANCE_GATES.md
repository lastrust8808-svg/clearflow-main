# Clear.Flow release acceptance gates

Status: BLOCKED until each gate has reproducible evidence for the *same candidate commit* and production-equivalent configuration. Passing unit tests alone is insufficient.

## Required gates (all mandatory)

| Gate | Acceptance evidence | Fail-closed requirement |
| --- | --- | --- |
| Tenant isolation | Actual HTTP tests: unauthenticated 401; wrong-tenant 403/404 for every account-scoped read/write route, including documents, Plaid items, proofs and remittances; session revocation | No anonymous or cross-tenant access |
| Entity membership and approvals | Two tenants, multiple entities, roles, grant/revoke, approval threshold, rejected/replayed approval, audit trail, persistence after restart | Unauthorized action and revoked role rejected |
| B2B delivery | Persist outbound payload, restart, retry with same idempotency key, acknowledge only after recipient durable save, reject duplicate and cross-tenant delivery | Never acknowledge unsaved delivery |
| Mercury/Plaid | Sandbox or authorized live test accounts: Link/OAuth resume, token rotation, webhooks, sync pagination, retries, duplicates, disconnection, provider failures | No mock success counted as provider pass |
| Transfers and reconciliation | Double-entry invariants, source/destination authorization, idempotency, unmatched items, partial settlement, reversal and audit evidence | No unbalanced or duplicate postings |
| Versioned migrations | Upgrade existing legacy user dataset; verify versions, backfill, constraints, repeat execution, rollback plan and zero data loss | Startup refuses incompatible schema |
| Backup and restore | Encrypted backup of disposable production-equivalent DB, restore to isolated DB, row/hash comparison, user/tenant access checks, documented RPO/RTO | No claim based only on backup creation |
| UI and document flow | Mobile + desktop authenticated browser runs for entity switching, invoice/document generation, QR verification, approvals, navigation and refresh persistence | Build pass alone does not qualify |
| Membership billing | Durable invoice/journal persistence, mandate verification, scheduler concurrency, payment provider sandbox, webhooks, delayed returns, reversals, duplicate prevention | No debit without explicit mandate; no success without verified settlement |
| Deployment | Confirm target Render workspace and exact deployed commit; read-only schema inspection; verify environment and health checks | No deployment to production until approved |

## Evidence contract

Each gate must record: candidate SHA, environment (with secrets redacted), command or manual procedure, timestamp, result, logs/artifacts URL, reviewer, and any remaining exceptions. Unknown, skipped, mocked, stale, or unavailable evidence means BLOCKED.

## Safe sequence

1. Integrate authenticated storage from PR #16 into an isolated candidate branch, not main.
2. Add missing tests and wiring in small reviewed commits. Keep Plaid mock setup excluded.
3. Run reproducible CI on the same SHA: TypeScript, build, security, banking, PostgreSQL 16/18 migration/recovery, browser E2E.
4. Run provider sandbox and disposable restore drills. Never test real payments without separate approval.
5. Obtain explicit Render workspace confirmation; inspect deployment and schema read-only.
6. Require human release approval before any merge, deployment, or production write.

Current gaps: PR #17 explicitly lacks durable recurring billing/provider execution; PR #21 lacks live QR/PDF/verification endpoint; PR #19 lacks authenticated provider E2E evidence. These are release blockers, not accepted exceptions.
